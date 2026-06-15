import type { FastifyRequest, FastifyReply } from "fastify"
import * as reportsService from "@/services/reports.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"

export async function attendance(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as Record<string, string | undefined>
    return reply.send(await reportsService.attendanceReport(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function noShows(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string }
    return reply.send(await reportsService.noShowsReport(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function birthdays(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { month?: string }
    return reply.send(await reportsService.birthdaysReport(ctx, { month: q.month ? Number(q.month) : undefined }))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function cid(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string }
    return reply.send(await reportsService.cidReport(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function repasse(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string }
    return reply.send(await reportsService.doctorRepasseReport(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}
