import type { FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"

import * as inviteService from "@/services/invite.service.js"

function handleError(req: FastifyRequest, reply: FastifyReply, error: any) {
  const code = error?.code
  if (code === "NOT_FOUND") return reply.status(404).send({ error: "Não encontrado" })
  if (code === "INVALID_CODE") return reply.status(400).send({ error: error.message })
  if (code === "INVALID_INVITE") return reply.status(400).send({ error: error.message })
  if (code === "INVITE_EXPIRED") return reply.status(410).send({ error: error.message })
  if (code === "EMAIL_MISMATCH") return reply.status(403).send({ error: error.message })
  if (code === "ALREADY_MEMBER") return reply.status(409).send({ error: error.message })
  if (code === "INVITE_PENDING") return reply.status(409).send({ error: error.message })
  if (code === "CRM_REQUIRED") return reply.status(400).send({ error: error.message })
  if (code === "INVALID_PASSWORD") return reply.status(400).send({ error: error.message })
  if (code === "DUPLICATE_FIELDS") {
    return reply.status(409).send({
      error: error.message || "Dados já cadastrados",
      fields: error.fields ?? {},
    })
  }
  req.log.error(error)
  return reply.status(500).send({ error: "Erro interno do servidor" })
}

export async function previewInvite(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { token } = req.params as { token: string }
    const result = await inviteService.previewInviteToken(token)
    return reply.send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function acceptInvite(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { token } = req.params as { token: string }
    const body = req.body as {
      name?: string
      password?: string
      cpf?: string
      crm?: string
      specialty?: string
      phone?: string
    }
    const payload = (req as any).user as { userId?: string } | undefined
    const result = await inviteService.acceptInviteToken(
      token,
      {
        name: body.name || "",
        password: body.password || "",
        cpf: body.cpf,
        crm: body.crm,
        specialty: body.specialty,
        phone: body.phone,
      },
      payload?.userId
    )
    return reply.send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function joinByCode(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { userId: string }
    const body = req.body as {
      inviteCode: string
      roleLabel?: string
      crm?: string
      specialty?: string
      phone?: string
      cpf?: string
    }
    const result = await inviteService.joinByInviteCode(payload.userId, body.inviteCode, body)
    return reply.send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function listClinicInvites(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { clinicId: string }
    const { id } = req.params as { id: string }
    if (payload.clinicId !== id) {
      return reply.status(403).send({ error: "Clínica inválida para esta sessão" })
    }
    const result = await inviteService.getClinicInviteOverview(id)
    return reply.send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function createClinicInvite(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { userId: string; clinicId: string }
    const { id } = req.params as { id: string }
    if (payload.clinicId !== id) {
      return reply.status(403).send({ error: "Clínica inválida para esta sessão" })
    }
    const body = req.body as { email: string; role: "ADMIN" | "DOCTOR" | "RECEPTION" }
    const result = await inviteService.createEmailInvite(id, payload.userId, body)
    return reply.status(201).send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function revokeClinicInvite(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { clinicId: string }
    const { id, inviteId } = req.params as { id: string; inviteId: string }
    if (payload.clinicId !== id) {
      return reply.status(403).send({ error: "Clínica inválida para esta sessão" })
    }
    await inviteService.revokeInvite(id, inviteId)
    return reply.send({ ok: true })
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export async function regenerateClinicCode(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.user as { clinicId: string }
    const { id } = req.params as { id: string }
    if (payload.clinicId !== id) {
      return reply.status(403).send({ error: "Clínica inválida para esta sessão" })
    }
    const result = await inviteService.regenerateInviteCode(id)
    return reply.send(result)
  } catch (error: any) {
    return handleError(req, reply, error)
  }
}

export const acceptInviteSchema = z.object({
  name: z.string().min(2).optional(),
  password: z.string().min(6).optional(),
  cpf: z.string().optional(),
  crm: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
})

export const joinByCodeSchema = z.object({
  inviteCode: z.string().min(4),
  roleLabel: z.string().optional(),
  crm: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  cpf: z.string().optional(),
})

export const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "DOCTOR", "RECEPTION"]).default("DOCTOR"),
})
