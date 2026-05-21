import type { FastifyRequest, FastifyReply } from "fastify"
import * as service from "@/services/waiting-list.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const p = req.user as JwtPayload
  return buildAuthContext(p.userId, p.clinicId)
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as { doctorId?: string; status?: string }
    return reply.send(await service.list(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar fila de espera" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const entry = await service.create(ctx, req.body as any)
    return reply.status(201).send(entry)
  } catch (error: any) {
    if (error.message === "PATIENT_NOT_FOUND") {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }
    if (error.message === "DOCTOR_NOT_LINKED") {
      return reply.status(403).send({ error: "Profissional nao permitido" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao adicionar a lista de espera" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const entry = await service.update(ctx, id, req.body as any)
    if (!entry) return reply.status(404).send({ error: "Registro nao encontrado" })
    return reply.send(entry)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar lista de espera" })
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
      return reply.status(404).send({ error: "Registro nao encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover da lista de espera" })
  }
}
