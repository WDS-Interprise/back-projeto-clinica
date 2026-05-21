import type { FastifyRequest, FastifyReply } from "fastify"
import * as clinicService from "@/services/clinic.service.js"

export async function list(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await clinicService.list()
    return reply.send(data)
  } catch (error) {
    _req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar clinicas" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const clinic = await clinicService.getById(id)
    if (!clinic) return reply.status(404).send({ error: "Clinica nao encontrada" })
    return reply.send(clinic)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar clinica" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const clinic = await clinicService.create(req.body as any)
    return reply.status(201).send(clinic)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar clinica" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const clinic = await clinicService.update(id, req.body as any)
    return reply.send(clinic)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar clinica" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    await clinicService.remove(id)
    return reply.status(204).send()
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover clinica" })
  }
}
