import type { FastifyRequest, FastifyReply } from "fastify"
import * as service from "@/services/agenda-note.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const p = req.user as JwtPayload
  return buildAuthContext(p.userId, p.clinicId)
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as { date?: string; startDate?: string; endDate?: string }
    return reply.send(await service.list(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar observacoes" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const note = await service.create(ctx, req.body as any)
    return reply.status(201).send(note)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar observacao" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const note = await service.update(ctx, id, req.body as any)
    if (!note) return reply.status(404).send({ error: "Observacao nao encontrada" })
    return reply.send(note)
  } catch (error: any) {
    if (error.message === "FORBIDDEN") {
      return reply.status(403).send({ error: "Sem permissao para editar" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar observacao" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await service.remove(ctx, id)
    return reply.status(204).send()
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Observacao nao encontrada" })
    }
    if (error.message === "FORBIDDEN") {
      return reply.status(403).send({ error: "Sem permissao para remover" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover observacao" })
  }
}
