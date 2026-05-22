import type { FastifyRequest, FastifyReply } from "fastify"
import * as patientService from "@/services/patient.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as JwtPayload
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { search, page, limit } = req.query as Record<string, string | undefined>
    const result = await patientService.list(ctx, {
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 100,
    })
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar pacientes" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const patient = await patientService.getById(ctx, id)

    if (!patient) {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }

    return reply.send(patient)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar paciente" })
  }
}

export async function getHistory(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const history = await import("@/services/patient-history.service.js").then((m) =>
      m.getPatientHistory(ctx, id)
    )
    if (!history) {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }
    return reply.send(history)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar historico do paciente" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const patient = await patientService.create(ctx, req.body)
    return reply.status(201).send(patient)
  } catch (error: any) {
    if (error.code === "DUPLICATE_FIELDS") {
      return reply.status(409).send({
        error: error.message || "Dados ja cadastrados",
        fields: error.fields ?? {},
      })
    }
    if (error.message === "CPF_EXISTS") {
      return reply.status(409).send({
        error: "Este CPF ja esta cadastrado",
        fields: { cpf: "Este CPF ja esta cadastrado no sistema" },
      })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar paciente" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const patient = await patientService.update(ctx, id, req.body)

    if (!patient) {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }

    return reply.send(patient)
  } catch (error: any) {
    if (error.code === "DUPLICATE_FIELDS") {
      return reply.status(409).send({
        error: error.message || "Dados ja cadastrados",
        fields: error.fields ?? {},
      })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar paciente" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await patientService.remove(ctx, id)
    return reply.status(204).send()
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Paciente nao encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover paciente" })
  }
}
