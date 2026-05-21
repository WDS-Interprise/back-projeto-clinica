import type { FastifyRequest, FastifyReply } from "fastify"
import * as dashboardService from "@/services/dashboard.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"

export async function stats(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await dashboardService.getStats(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function panelMetrics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await dashboardService.getPanelMetrics(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function todayPatients(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await dashboardService.getTodayPatients(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function upcomingAppointments(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await dashboardService.getUpcomingAppointments(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function recentPatients(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await dashboardService.getRecentPatients(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}
