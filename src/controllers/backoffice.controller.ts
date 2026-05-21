import type { FastifyRequest, FastifyReply } from "fastify"
import * as backofficeService from "@/services/backoffice.service.js"
import type { JwtPayload } from "@/types/index.js"

export async function status(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    service: "backoffice",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password } = req.body as { email: string; password: string }
    const result = await backofficeService.adminLogin(email, password)

    if (!result) {
      return reply.status(401).send({
        error: "Credenciais invalidas ou usuario nao e dono da plataforma",
      })
    }

    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function metrics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await backofficeService.getMetrics()
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function listClinics(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send(await backofficeService.listClinics())
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar clinicas" })
  }
}

export async function createClinic(req: FastifyRequest, reply: FastifyReply) {
  try {
    const clinic = await backofficeService.createClinic(req.body as any)
    return reply.status(201).send(clinic)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar clinica" })
  }
}

export async function updateClinic(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const clinic = await backofficeService.updateClinic(id, req.body as any)
    return reply.send(clinic)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar clinica" })
  }
}

export async function listUsers(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as {
      role?: string
      clinicId?: string
      search?: string
      includeInactive?: string
    }
    return reply.send(
      await backofficeService.listUsers({
        role: q.role,
        clinicId: q.clinicId,
        search: q.search,
        includeInactive: q.includeInactive === "true" || q.includeInactive === "1",
      })
    )
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar usuarios" })
  }
}

export async function getUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const user = await backofficeService.getUserById(id)
    if (!user) return reply.status(404).send({ error: "Usuario nao encontrado" })
    return reply.send(user)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar usuario" })
  }
}

export async function createUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await backofficeService.createPlatformUser(req.body as any)
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
    if (error.message === "CLINIC_NOT_FOUND") {
      return reply.status(404).send({ error: "Clinica nao encontrada" })
    }
    if (error.code === "INVALID_PASSWORD") {
      return reply.status(400).send({ error: error.message })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar usuario" })
  }
}

export async function removeUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const payload = req.user as { userId: string }
    await backofficeService.removePlatformUser(id, payload.userId)
    return reply.status(204).send()
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Usuario nao encontrado" })
    }
    if (error.message === "CANNOT_DELETE_SELF") {
      return reply.status(400).send({ error: "Voce nao pode excluir sua propria conta" })
    }
    if (error.message === "LAST_OWNER") {
      return reply.status(400).send({ error: "Nao e possivel excluir o ultimo dono da plataforma" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao excluir usuario" })
  }
}

export async function updateUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const user = await backofficeService.updatePlatformUser(id, req.body as any)
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

export async function listPatients(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as {
      clinicId?: string
      search?: string
      page?: string
      limit?: string
    }
    const data = await backofficeService.listPatients({
      clinicId: q.clinicId,
      search: q.search,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    })
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar pacientes" })
  }
}

export async function me(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  const ok = await backofficeService.assertPlatformOwner(payload.userId)
  if (!ok) return reply.status(403).send({ error: "Acesso negado" })
  const user = await backofficeService.getUserById(payload.userId)
  return reply.send(user)
}
