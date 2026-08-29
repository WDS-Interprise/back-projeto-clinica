#!/usr/bin/env node
/**
 * Prod Prisma migrate helper (ClinMax).
 * - Baselines P3005 (schema nao-vazio sem historico) com resolve --applied seletivo
 * - Limpa migration FAILED (P3018) com resolve --rolled-back antes de redeploy
 * - Sem sqlite, sem db push cego; hard-fail em erros reais
 *
 * Env:
 *   DATABASE_URL (obrigatorio, postgres)
 *   NPX_BIN / PRISMA_BIN (opcional)
 */
"use strict"

const { spawnSync } = require("node:child_process")
const path = require("node:path")

const ROOT = path.resolve(__dirname, "..")

const MIGRATIONS = {
  agenda: "20260520100000_agenda_completa",
  bula: "20260521140000_bula_cache",
  whatsapp: "20260521220000_whatsapp_ai_assistant",
  clinical: "20260825010000_clinical_core_hardening",
  outboxPlatform: "20260829021000_outbox_platform_settings",
  saasPlanWhatsappAi: "20260829030000_saas_plan_whatsapp_ai_prod",
}

function fail(msg) {
  console.error(`[prod-migrate] ${msg}`)
  process.exit(1)
}

function normalizeDatabaseUrl(raw) {
  let url = String(raw || "").trim()
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim()
  }
  return url
}

function assertPostgresUrl(url) {
  if (!url) fail("DATABASE_URL vazia")
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    fail(`DATABASE_URL deve ser Postgres. Prefixo: ${url.slice(0, 48)}`)
  }
  if (/(^file:|^sqlite:|sqlite)/i.test(url)) {
    fail("SQLite/file: proibido em producao")
  }
}

function prismaBin() {
  if (process.env.PRISMA_BIN) return { cmd: process.env.PRISMA_BIN, prefix: [] }
  if (process.env.NPX_BIN) return { cmd: process.env.NPX_BIN, prefix: ["prisma"] }
  return { cmd: "npx", prefix: ["prisma"] }
}

function runPrisma(args, { allowFail = false } = {}) {
  const { cmd, prefix } = prismaBin()
  const full = [...prefix, ...args]
  console.log(`[prod-migrate] $ ${cmd} ${full.join(" ")}`)
  const res = spawnSync(cmd, full, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    shell: false,
  })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.error) {
    if (allowFail) return { ok: false, code: 1, stdout: "", stderr: String(res.error) }
    fail(`falha ao executar prisma: ${res.error.message}`)
  }
  const code = res.status ?? 1
  if (code !== 0 && !allowFail) {
    fail(`prisma saiu com codigo ${code}`)
  }
  return {
    ok: code === 0,
    code,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  }
}

function dockerPsql(sql) {
  const res = spawnSync(
    "docker",
    ["exec", "-i", "clinmax_postgres", "psql", "-U", "clinmax", "-d", "clinmax", "-v", "ON_ERROR_STOP=1", "-tAc", sql],
    { encoding: "utf8", shell: false }
  )
  if (res.status !== 0) {
    return { ok: false, out: (res.stdout || "") + (res.stderr || "") }
  }
  return { ok: true, out: (res.stdout || "").trim() }
}

function tableExists(name) {
  const r = dockerPsql(
    `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='${name.replace(/'/g, "''")}'`
  )
  return r.ok && r.out === "1"
}

function columnExists(table, column) {
  const r = dockerPsql(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${table.replace(/'/g, "''")}' AND column_name='${column.replace(/'/g, "''")}'`
  )
  return r.ok && r.out === "1"
}

function enumExists(name) {
  const r = dockerPsql(
    `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='${name.replace(/'/g, "''")}'`
  )
  return r.ok && r.out === "1"
}

function migrationFailed(name) {
  const r = dockerPsql(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name='${name.replace(/'/g, "''")}' AND finished_at IS NULL AND rolled_back_at IS NULL`
  )
  return r.ok && r.out === "1"
}

function migrationApplied(name) {
  const r = dockerPsql(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name='${name.replace(/'/g, "''")}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`
  )
  return r.ok && r.out === "1"
}

function resolveApplied(name) {
  if (migrationApplied(name)) {
    console.log(`[prod-migrate] ja applied: ${name}`)
    return
  }
  runPrisma(["migrate", "resolve", "--applied", name])
}

function resolveRolledBack(name) {
  console.log(`[prod-migrate] limpando FAILED: ${name}`)
  runPrisma(["migrate", "resolve", "--rolled-back", name], { allowFail: true })
}

function baselineIfNeeded() {
  const canProbe = dockerPsql("SELECT 1").ok
  if (!canProbe) {
    console.log(
      "[prod-migrate] docker/psql indisponivel — pulando baseline automatico; migrate deploy direto"
    )
    return
  }

  // Recovery: clinical_core_hardening em estado FAILED (P3018 Encounter etc.)
  if (migrationFailed(MIGRATIONS.clinical)) {
    resolveRolledBack(MIGRATIONS.clinical)
  }

  const history = dockerPsql(`SELECT COUNT(*)::text FROM "_prisma_migrations"`)
  const historyCount = history.ok ? Number(history.out || "0") : 0
  const schemaPartial = enumExists("Role") || tableExists("Clinic") || tableExists("User")

  // P3005 path: schema existe, historico vazio ou incompleto
  if (schemaPartial) {
    if (enumExists("Role") || tableExists("Clinic")) {
      resolveApplied(MIGRATIONS.agenda)
    }
    if (tableExists("BulaCache")) {
      resolveApplied(MIGRATIONS.bula)
    }
    if (columnExists("ClinicWhatsappSettings", "aiAssistantEnabled")) {
      resolveApplied(MIGRATIONS.whatsapp)
    }
    // clinical: so marcar applied se Outbox ja existe E nao queremos re-rodar SQL.
    // Preferimos deixar migrate deploy aplicar o SQL corrigido (guards IF EXISTS).
    if (
      tableExists("OutboxEvent") &&
      tableExists("IdempotencyRecord") &&
      !migrationFailed(MIGRATIONS.clinical) &&
      historyCount > 0
    ) {
      // Se SQL antigo ja rodou parcialmente com sucesso em outro ambiente
      if (!migrationApplied(MIGRATIONS.clinical)) {
        // Nao forcar applied se a migration corrigida ainda precisa rodar
      }
    }
  }

  console.log(`[prod-migrate] historico _prisma_migrations count≈${historyCount}`)
}

function main() {
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL)
  assertPostgresUrl(databaseUrl)
  process.env.DATABASE_URL = databaseUrl

  console.log("[prod-migrate] iniciando (Postgres only, sem db push)")
  baselineIfNeeded()

  const deploy = runPrisma(["migrate", "deploy"], { allowFail: true })
  if (!deploy.ok) {
    const blob = `${deploy.stdout}\n${deploy.stderr}`
    if (/P3005/i.test(blob)) {
      console.log("[prod-migrate] P3005 detectado — baseline forçado das migrations 1-3")
      resolveApplied(MIGRATIONS.agenda)
      resolveApplied(MIGRATIONS.bula)
      resolveApplied(MIGRATIONS.whatsapp)
      runPrisma(["migrate", "deploy"])
      return
    }
    if (/P3018/i.test(blob) && /clinical_core_hardening/i.test(blob)) {
      console.log("[prod-migrate] P3018 em clinical — resolve --rolled-back e retry")
      resolveRolledBack(MIGRATIONS.clinical)
      runPrisma(["migrate", "deploy"])
      return
    }
    fail("migrate deploy falhou (sem fallback sqlite/db push)")
  }

  console.log("[prod-migrate] OK")
}

main()
