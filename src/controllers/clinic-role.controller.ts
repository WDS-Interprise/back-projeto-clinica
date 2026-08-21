import type { FastifyReply, FastifyRequest } from "fastify"
import { ctxFromRequest } from "@/lib/auth-context.js"
import * as clinicRoleService from "@/services/clinic-role.service.js"

export async function listRoles(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const roles = await clinicRoleService.listClinicRoles(ctx)
    return reply.send({ roles, groups: clinicRoleService.PERMISSION_GROUPS })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro"
    return reply.status(400).send({ error: msg })
  }
}

export async function getRole(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const role = await clinicRoleService.getClinicRole(ctx, id)
    return reply.send(role)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro"
    const status = msg === "NOT_FOUND" ? 404 : 400
    return reply.status(status).send({ error: msg })
  }
}

export async function createRole(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const body = req.body as { name: string; permissions: string[] }
    const role = await clinicRoleService.createClinicRole(ctx, body)
    return reply.status(201).send(role)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro"
    return reply.status(400).send({ error: msg })
  }
}

export async function updateRole(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const body = req.body as { name?: string; permissions?: string[] }
    const role = await clinicRoleService.updateClinicRole(ctx, id, body)
    return reply.send(role)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro"
    const status = msg === "NOT_FOUND" ? 404 : 400
    return reply.status(status).send({ error: msg })
  }
}

export async function removeRole(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    await clinicRoleService.deleteClinicRole(ctx, id)
    return reply.status(204).send()
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro"
    const status =
      msg === "NOT_FOUND" ? 404 : msg === "SYSTEM_ROLE" || msg === "ROLE_IN_USE" ? 409 : 400
    const labels: Record<string, string> = {
      SYSTEM_ROLE: "Cargos do sistema não podem ser excluídos",
      ROLE_IN_USE: "Este cargo ainda está atribuído a membros da equipe",
    }
    return reply.status(status).send({ error: labels[msg] ?? msg })
  }
}
