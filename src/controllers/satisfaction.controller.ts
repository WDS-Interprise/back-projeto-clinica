import type { FastifyRequest, FastifyReply } from "fastify"
import * as satisfactionService from "@/services/satisfaction.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"
import type { SatisfactionSendStatus } from "@prisma/client"

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { sendStatus?: SatisfactionSendStatus; dateFrom?: string; dateTo?: string }
    return reply.send(await satisfactionService.listSurveys(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function summary(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string }
    return reply.send(await satisfactionService.getSummary(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await satisfactionService.createSurvey(ctx, req.body as Parameters<typeof satisfactionService.createSurvey>[1]))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar pesquisa" })
  }
}

export async function markSent(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    return reply.send(await satisfactionService.markSent(ctx, id))
  } catch (error) {
    req.log.error(error)
    return reply.status(404).send({ error: "Pesquisa não encontrada" })
  }
}

export async function submitAnswer(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    return reply.send(await satisfactionService.submitAnswer(ctx, id, req.body as { rating: number; comment?: string }))
  } catch (error) {
    req.log.error(error)
    return reply.status(404).send({ error: "Pesquisa não encontrada" })
  }
}
