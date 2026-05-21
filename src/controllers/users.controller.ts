import type { FastifyRequest, FastifyReply } from "fastify"
import * as userService from "@/services/user.service.js"
import type { JwtPayload } from "@/types/index.js"

function clinicId(req: FastifyRequest) {
  const id = (req.user as JwtPayload).clinicId
  if (!id) throw new Error("NO_CLINIC")
  return id
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { role } = req.query as { role?: string }
    const data = await userService.list(clinicId(req), role)
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar usuarios" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const user = await userService.getById(id, clinicId(req))
    if (!user) return reply.status(404).send({ error: "Usuario nao encontrado" })
    return reply.send(user)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar usuario" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as any
    const user = await userService.createUser({
      ...body,
      clinicId: clinicId(req),
    })
    return reply.status(201).send(user)
  } catch (error: any) {
    if (error.code === "DUPLICATE_FIELDS") {
      return reply.status(409).send({
        error: error.message || "Dados ja cadastrados",
        fields: error.fields ?? {},
      })
    }
    if (error.message === "EMAIL_EXISTS") {
      return reply.status(409).send({
        error: "Este e-mail ja esta cadastrado",
        fields: { email: "Este e-mail ja esta cadastrado no sistema" },
      })
    }
    if (error.code === "INVALID_PASSWORD") {
      return reply.status(400).send({ error: error.message })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar usuario" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const user = await userService.updateUser(id, clinicId(req), req.body as any)
    if (!user) return reply.status(404).send({ error: "Usuario nao encontrado" })
    return reply.send(user)
  } catch (error: any) {
    if (error.code === "DUPLICATE_FIELDS") {
      return reply.status(409).send({
        error: error.message || "Dados ja cadastrados",
        fields: error.fields ?? {},
      })
    }
    if (error.code === "INVALID_PASSWORD") {
      return reply.status(400).send({ error: error.message })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar usuario" })
  }
}

export async function setLinkedDoctors(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const { doctorIds } = req.body as { doctorIds: string[] }
    const user = await userService.setLinkedDoctors(id, clinicId(req), doctorIds ?? [])
    return reply.send(user)
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Recepcionista nao encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao vincular profissionais" })
  }
}
