import type { FastifyRequest, FastifyReply } from "fastify"
import * as doctorService from "@/services/doctor.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { available, specialty } = req.query as Record<string, string | undefined>
    let ctx = null
    if (req.user) {
      const payload = req.user as JwtPayload
      ctx = await buildAuthContext(payload.userId, payload.clinicId)
    }
    const doctors = await doctorService.list(ctx, {
      available: available === "true" ? true : undefined,
      specialty,
    })
    return reply.send(doctors)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar medicos" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const doctor = await doctorService.getById(id)

    if (!doctor) {
      return reply.status(404).send({ error: "Medico nao encontrado" })
    }

    return reply.send(doctor)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar medico" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const doctor = await doctorService.create(req.body)
    return reply.status(201).send(doctor)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar medico" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const doctor = await doctorService.update(id, req.body)
    return reply.send(doctor)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar medico" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    await doctorService.remove(id)
    return reply.status(204).send()
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover medico" })
  }
}
