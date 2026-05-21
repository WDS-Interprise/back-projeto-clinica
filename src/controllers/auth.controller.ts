import type { FastifyRequest, FastifyReply } from "fastify"
import * as authService from "@/services/auth.service.js"

export async function login(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password } = req.body as { email: string; password: string }
    const result = await authService.login(email, password)

    if (!result) {
      return reply.status(401).send({ error: "Credenciais invalidas" })
    }

    return reply.send(result)
  } catch (error: any) {
    if (error.code === "USER_INACTIVE") {
      return reply.status(403).send({ error: "Usuario inativo" })
    }
    if (error.code === "NO_CLINIC") {
      return reply.status(403).send({ error: "Usuario sem clinica vinculada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function register(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await authService.register(req.body as any)
    return reply.status(201).send(result)
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
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function completeOnboarding(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { userId: string }
    const result = await authService.completeOnboarding(
      payload.userId,
      req.body as { roleLabel: string; teamSize: string; clinicName?: string }
    )
    return reply.send(result)
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Usuario nao encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao concluir configuracao inicial" })
  }
}

export async function me(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { userId: string; clinicId?: string }
    const user = await authService.getMe(payload.userId, payload.clinicId ?? undefined)

    if (!user) {
      return reply.status(404).send({ error: "Usuario nao encontrado" })
    }

    return reply.send(user)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}
