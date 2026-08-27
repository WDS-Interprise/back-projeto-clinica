const fs = require("node:fs")
const path = require("node:path")
const {
  assertPermanentNvmNode,
  normalizedPath,
} = require("./permanent-node.cjs")

function validatePm2Registration(
  processes,
  expectedNode,
  expectedAppDir,
  { requireRuntime = true } = {}
) {
  if (!Array.isArray(processes)) {
    throw new Error("A lista de processos do PM2 precisa ser um array")
  }

  const app = processes.find((processInfo) => processInfo?.name === "clinmax-api")

  if (!app) {
    throw new Error("PM2 nao registrou o processo clinmax-api")
  }

  const pm2Env = app.pm2_env || app
  const expectedInterpreter = assertPermanentNvmNode(expectedNode)
  const interpreter = String(pm2Env.exec_interpreter || "")
  const script = String(pm2Env.pm_exec_path || "")
  const cwd = String(pm2Env.pm_cwd || "")
  const expectedCwd = path.resolve(expectedAppDir)
  const expectedScriptPath = path.resolve(expectedCwd, "dist", "index.js")
  const restartCount = Number(pm2Env.restart_time || 0)

  if (normalizedPath(interpreter) !== normalizedPath(expectedInterpreter)) {
    throw new Error(
      `Interpreter incorreto no PM2. Esperado ${expectedInterpreter}, recebido ${interpreter}`
    )
  }

  assertPermanentNvmNode(interpreter)

  if (normalizedPath(cwd) !== normalizedPath(expectedCwd)) {
    throw new Error(`Diretorio incorreto no PM2. Esperado ${expectedCwd}, recebido ${cwd}`)
  }

  if (normalizedPath(script) !== normalizedPath(expectedScriptPath)) {
    throw new Error(
      `Script incorreto no PM2. Esperado ${expectedScriptPath}, recebido ${script}`
    )
  }

  if (requireRuntime) {
    if (pm2Env.status !== "online" || !Number.isInteger(app.pid) || app.pid <= 0) {
      throw new Error(
        `Processo clinmax-api sem PID real ou fora do ar. status=${pm2Env.status}, pid=${app.pid}`
      )
    }

    if (restartCount !== 0) {
      throw new Error(`Processo clinmax-api reiniciou ${restartCount} vez(es) durante o deploy`)
    }
  }

  const runtimeDetails = requireRuntime ? `pid=${app.pid}, reinicios=0, ` : ""
  return `PM2 validado: ${runtimeDetails}interpreter=${interpreter}, script=${script}`
}

if (require.main === module) {
  const [jlistPath, expectedNode, expectedAppDir, mode = "runtime"] = process.argv.slice(2)

  if (!jlistPath || !expectedNode || !expectedAppDir) {
    throw new Error(
      "Uso: node scripts/validate-pm2-registration.cjs <pm2.json> <node-nvm> <app-dir> [runtime|saved]"
    )
  }
  if (!["runtime", "saved"].includes(mode)) {
    throw new Error(`Modo de validacao PM2 invalido: ${mode}`)
  }

  const processes = JSON.parse(fs.readFileSync(jlistPath, "utf8"))
  console.log(
    validatePm2Registration(processes, expectedNode, expectedAppDir, {
      requireRuntime: mode === "runtime",
    })
  )
}

module.exports = { validatePm2Registration }
