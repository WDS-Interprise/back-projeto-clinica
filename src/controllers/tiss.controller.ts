import type { FastifyRequest, FastifyReply } from "fastify"
import * as tissService from "@/services/tiss.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"
import type { TissGuideStatus } from "@prisma/client"

export async function listGuides(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { status?: TissGuideStatus; search?: string }
    return reply.send(await tissService.listGuides(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function createGuide(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await tissService.createGuide(ctx, req.body as Parameters<typeof tissService.createGuide>[1]))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar guia" })
  }
}

export async function updateStatus(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: TissGuideStatus }
    return reply.send(await tissService.updateGuideStatus(ctx, id, status))
  } catch (error) {
    req.log.error(error)
    return reply.status(404).send({ error: "Guia não encontrada" })
  }
}
