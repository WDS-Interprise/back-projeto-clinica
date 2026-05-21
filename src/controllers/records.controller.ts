import type { FastifyRequest, FastifyReply } from "fastify"
import * as recordService from "@/services/record.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as JwtPayload
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as Record<string, string | undefined>
    const result = await recordService.list(ctx, {
      patientId: q.patientId,
      doctorId: q.doctorId,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
    })
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar prontuarios" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const record = await recordService.getById(ctx, id)

    if (!record) {
      return reply.status(404).send({ error: "Prontuario nao encontrado" })
    }

    return reply.send(record)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar prontuario" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const record = await recordService.create(ctx, req.body)
    return reply.status(201).send(record)
  } catch (error: any) {
    if (error.message === "PATIENT_NOT_FOUND") {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar prontuario" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const record = await recordService.update(ctx, id, req.body)
    if (!record) {
      return reply.status(404).send({ error: "Prontuario nao encontrado" })
    }
    return reply.send(record)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar prontuario" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await recordService.remove(ctx, id)
    return reply.status(204).send()
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Prontuario nao encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover prontuario" })
  }
}
