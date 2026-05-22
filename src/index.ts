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
import { hasPermission, type Permission } from "@/lib/permissions.js"
import { assertPlatformOwner } from "@/services/backoffice.service.js"
import userRoutes from "@/routes/users.routes.js"
import clinicRoutes from "@/routes/clinics.routes.js"
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
import { JWT_SECRET, PORT } from "@/lib/env.js"
import { startWhatsappScheduler } from "@/whatsapp/reminder.scheduler.js"
import { resumeWhatsappSessionsOnBoot } from "@/services/whatsapp.service.js"

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

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
    const ok = perms.some((p) => hasPermission(payload.role, p))
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

app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() }
})

await app.register(authRoutes, { prefix: "/api/auth" })
await app.register(patientRoutes, { prefix: "/api/patients" })
await app.register(doctorRoutes, { prefix: "/api/doctors" })
await app.register(appointmentRoutes, { prefix: "/api/appointments" })
await app.register(recordRoutes, { prefix: "/api/records" })
await app.register(dashboardRoutes, { prefix: "/api/dashboard" })
await app.register(proceduresRoutes, { prefix: "/api/procedures" })
await app.register(backofficeRoutes, { prefix: "/api/backoffice" })
await app.register(userRoutes, { prefix: "/api/users" })
await app.register(clinicRoutes, { prefix: "/api/clinics" })
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
await app.register(publicPrescriptionRoutes, { prefix: "/api/public" })

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`[ClinMax API] running on http://localhost:${PORT}`)
  void resumeWhatsappSessionsOnBoot()
  startWhatsappScheduler()
})
