import { randomUUID } from "crypto"
import Fastify from "fastify"
import cors from "@fastify/cors"
import jwt from "jsonwebtoken"
import authRoutes from "@/routes/auth.routes.js"
import patientRoutes from "@/routes/patients.routes.js"
import doctorRoutes from "@/routes/doctors.routes.js"
import appointmentRoutes from "@/routes/appointments.routes.js"
import recordRoutes from "@/routes/records.routes.js"
import dashboardRoutes from "@/routes/dashboard.routes.js"
import proceduresRoutes from "@/routes/procedures.routes.js"
import backofficeRoutes from "@/routes/backoffice.routes.js"
import type { JwtPayload } from "@/types/index.js"
import { type Permission } from "@/lib/permissions.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import { assertPlatformOwner } from "@/services/backoffice.service.js"
import userRoutes from "@/routes/users.routes.js"
import clinicRoutes from "@/routes/clinics.routes.js"
import inviteRoutes, { clinicInviteRoutes } from "@/routes/invite.routes.js"
import waitingListRoutes from "@/routes/waiting-list.routes.js"
import agendaNotesRoutes from "@/routes/agenda-notes.routes.js"
import outrosRoutes from "@/routes/outros.routes.js"
import cid10Routes from "@/routes/cid10.routes.js"
import cid11Routes from "@/routes/cid11.routes.js"
import cidRoutes from "@/routes/cid.routes.js"
import whatsappRoutes from "@/routes/whatsapp.routes.js"
import prescriptionsRoutes, { publicPrescriptionRoutes } from "@/routes/prescriptions.routes.js"
import medicamentosRoutes from "@/routes/medicamentos.routes.js"
import examesRoutes from "@/routes/exames.routes.js"
import vacinasRoutes from "@/routes/vacinas.routes.js"
import financeRoutes from "@/routes/finance.routes.js"
import reportsRoutes from "@/routes/reports.routes.js"
import inventoryRoutes from "@/routes/inventory.routes.js"
import tissRoutes from "@/routes/tiss.routes.js"
import satisfactionRoutes from "@/routes/satisfaction.routes.js"
import webhooksRoutes from "@/routes/webhooks.routes.js"
import clinicRoleRoutes from "@/routes/clinic-role.routes.js"
import backofficeSaasRoutes from "@/routes/backoffice-saas.routes.js"
import subscriptionRoutes from "@/routes/subscription.routes.js"
import publicPlansRoutes from "@/routes/public-plans.routes.js"
import encounterRoutes from "@/routes/encounters.routes.js"
import { type PlanFeature } from "@/lib/plan-features.js"
import { clinicHasFeature } from "@/lib/plan-entitlements.js"
import { ensurePlatformPlansAndSettings, migrateExistingClinicsToLegacy } from "@/lib/saas-billing-seed.js"
import { runSubscriptionLifecycle } from "@/services/subscription-lifecycle.service.js"
import { JWT_SECRET, PORT } from "@/lib/env.js"
import { resolveCorsOrigins } from "@/lib/cors.js"
import { startWhatsappScheduler } from "@/whatsapp/reminder.scheduler.js"
import { resumeWhatsappSessionsOnBoot } from "@/services/whatsapp.service.js"

const app = Fastify({
  logger: true,
  genReqId: (req) => {
    const header = req.headers["x-request-id"]
    if (typeof header === "string" && header.trim()) return header.trim()
    return randomUUID()
  },
  requestIdHeader: "x-request-id",
})

await app.register(cors, {
  origin: resolveCorsOrigins(),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept", "Idempotency-Key", "X-Request-Id"],
  maxAge: 86_400,
})

function extractBearerToken(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  return header.slice(7).trim()
}

app.decorate("auth", async (req: any, reply: any) => {
  const token = extractBearerToken(req)
  if (!token) {
    return reply.status(401).send({ error: "Token invalido" })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return reply.status(401).send({ error: "Token invalido" })
  }
})

app.decorate("requireRole", (...roles: string[]) => {
  return async (req: any, reply: any) => {
    const payload = req.user as JwtPayload
    if (!payload || !roles.includes(payload.role)) {
      return reply.status(403).send({ error: "Acesso nao autorizado" })
    }
  }
})

app.decorate("requirePermission", (...perms: Permission[]) => {
  return async (req: any, reply: any) => {
    const payload = req.user as JwtPayload
    if (!payload) {
      return reply.status(401).send({ error: "Nao autenticado" })
    }
    const ctx = await buildAuthContext(payload.userId, payload.clinicId)
    const ok = perms.some((p) => ctx.permissions.includes(p))
    if (!ok) {
      return reply.status(403).send({ error: "Permissao negada" })
    }
  }
})

app.decorate("requirePlatformOwner", async (req: any, reply: any) => {
  const payload = req.user as JwtPayload
  if (!payload?.userId) {
    return reply.status(401).send({ error: "Nao autenticado" })
  }
  if (payload.isPlatformOwner) return
  const ok = await assertPlatformOwner(payload.userId)
  if (!ok) {
    return reply.status(403).send({ error: "Acesso restrito a donos da plataforma" })
  }
})

app.decorate("requirePlanFeature", (...features: PlanFeature[]) => {
  return async (req: any, reply: any) => {
    const payload = req.user as JwtPayload
    if (!payload?.clinicId) {
      return reply.status(401).send({ error: "Nao autenticado" })
    }
    for (const feature of features) {
      const ok = await clinicHasFeature(payload.clinicId, feature)
      if (!ok) {
        return reply.status(403).send({ error: "PLAN_FEATURE_REQUIRED", feature })
      }
    }
  }
})

app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() }
})

app.get("/api/ready", async (_req, reply) => {
  try {
    await (await import("@/lib/prisma.js")).default.$queryRaw`SELECT 1`
    return { status: "ready", db: true, timestamp: new Date().toISOString() }
  } catch {
    return reply.status(503).send({ status: "not_ready", db: false })
  }
})

await app.register(authRoutes, { prefix: "/api/auth" })
await app.register(patientRoutes, { prefix: "/api/patients" })
await app.register(doctorRoutes, { prefix: "/api/doctors" })
await app.register(appointmentRoutes, { prefix: "/api/appointments" })
await app.register(encounterRoutes, { prefix: "/api/encounters" })
await app.register(recordRoutes, { prefix: "/api/records" })
await app.register(dashboardRoutes, { prefix: "/api/dashboard" })
await app.register(proceduresRoutes, { prefix: "/api/procedures" })
await app.register(backofficeRoutes, { prefix: "/api/backoffice" })
await app.register(backofficeSaasRoutes, { prefix: "/api/backoffice" })
await app.register(subscriptionRoutes, { prefix: "/api/subscription" })
await app.register(userRoutes, { prefix: "/api/users" })
await app.register(clinicRoutes, { prefix: "/api/clinics" })
await app.register(clinicInviteRoutes, { prefix: "/api/clinics" })
await app.register(inviteRoutes, { prefix: "/api/invites" })
await app.register(waitingListRoutes, { prefix: "/api/waiting-list" })
await app.register(agendaNotesRoutes, { prefix: "/api/agenda-notes" })
await app.register(outrosRoutes, { prefix: "/api/outros" })
await app.register(cid10Routes, { prefix: "/api/cid10" })
await app.register(cid11Routes, { prefix: "/api/cid11" })
await app.register(cidRoutes, { prefix: "/api/cid" })
await app.register(whatsappRoutes, { prefix: "/api/whatsapp" })
await app.register(prescriptionsRoutes, { prefix: "/api/prescriptions" })
await app.register(medicamentosRoutes, { prefix: "/api/medicamentos" })
await app.register(examesRoutes, { prefix: "/api/exames" })
await app.register(vacinasRoutes, { prefix: "/api/vacinas" })
await app.register(financeRoutes, { prefix: "/api/finance" })
await app.register(reportsRoutes, { prefix: "/api/reports" })
await app.register(inventoryRoutes, { prefix: "/api/inventory" })
await app.register(tissRoutes, { prefix: "/api/tiss" })
await app.register(satisfactionRoutes, { prefix: "/api/satisfaction" })
await app.register(clinicRoleRoutes, { prefix: "/api/clinic-roles" })
await app.register(webhooksRoutes, { prefix: "/api/webhooks" })
await app.register(publicPlansRoutes, { prefix: "/api/public" })
await app.register(publicPrescriptionRoutes, { prefix: "/api/public" })

app.listen({ port: PORT, host: "0.0.0.0" }).then(async () => {
  console.log(`[ClinMax API] running on http://localhost:${PORT}`)
  try {
    await ensurePlatformPlansAndSettings()
    await migrateExistingClinicsToLegacy()
    await runSubscriptionLifecycle()
  } catch (err) {
    console.warn("[SaaS Billing] seed/migration on boot:", err)
  }
  void resumeWhatsappSessionsOnBoot()
  startWhatsappScheduler()
})
