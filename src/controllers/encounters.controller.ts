import type { FastifyRequest, FastifyReply } from "fastify"
import * as encounterService from "@/services/encounter.service.js"
import { suggestAttendanceDraftForEncounter } from "@/services/attendance-ai.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import { domainErrorToHttp } from "@/lib/domain-error.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as JwtPayload
  return buildAuthContext(payload.userId, payload.clinicId)
}

function mapError(error: unknown, reply: FastifyReply) {
  const domain = domainErrorToHttp(error)
  if (domain) return reply.status(domain.status).send(domain.body)
  const message = error instanceof Error ? error.message : ""
  if (message === "NOT_FOUND") {
    return reply.status(404).send({ error: "Atendimento nao encontrado", code: "NOT_FOUND" })
  }
  if (message === "PERMISSION_DENIED") {
    return reply.status(403).send({ error: "Permissao negada", code: "PERMISSION_DENIED" })
  }
  if (message === "DOCTOR_NOT_ALLOWED") {
    return reply.status(403).send({ error: "Profissional nao permitido", code: "DOCTOR_NOT_ALLOWED" })
  }
  if (message === "CLINIC_NOT_ALLOWED") {
    return reply.status(403).send({ error: "Clinica nao autorizada", code: "CLINIC_NOT_ALLOWED" })
  }
  if (message === "INVALID_STATUS_TRANSITION") {
    return reply.status(409).send({ error: "Transicao de status invalida", code: "INVALID_STATUS_TRANSITION" })
  }
  if (message === "PATIENT_REQUIRED") {
    return reply.status(400).send({ error: "Agendamento sem paciente", code: "PATIENT_REQUIRED" })
  }
  if (message === "OPENROUTER_NOT_CONFIGURED") {
    return reply.status(503).send({ error: "IA nao configurada no servidor" })
  }
  return null
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const encounter = await encounterService.getById(ctx, id)
    if (!encounter) return reply.status(404).send({ error: "Atendimento nao encontrado" })
    return reply.send(encounter)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar atendimento" })
  }
}

export async function resolve(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const resolved = await encounterService.resolveForAttendanceRoute(ctx, id)
    if (!resolved) return reply.status(404).send({ error: "Atendimento nao encontrado" })
    return reply.send(resolved)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao resolver atendimento" })
  }
}

export async function startFromAppointment(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { appointmentId } = req.params as { appointmentId: string }
    const result = await encounterService.startOrResumeFromAppointment(ctx, appointmentId)
    return reply.send(result)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao iniciar atendimento" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as Record<string, unknown>
    const encounter = await encounterService.updateClinical(ctx, id, {
      ...(body as any),
      expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
    })
    return reply.send(encounter)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao salvar atendimento" })
  }
}

export async function complete(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as {
      signatureMode?: "NONE" | "LOCAL_CERT" | "CLOUD_CERT"
      expectedVersion?: number
    }
    const encounter = await encounterService.complete(ctx, id, {
      signatureMode: body.signatureMode,
      expectedVersion: body.expectedVersion,
    })
    return reply.send(encounter)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao finalizar atendimento" })
  }
}

export async function addAddendum(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = req.body as { body?: string; reason?: string }
    const encounter = await encounterService.addAddendum(ctx, id, {
      body: body.body ?? "",
      reason: body.reason,
    })
    return reply.send(encounter)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar adendo" })
  }
}

export async function recentByPatient(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { patientId } = req.params as { patientId: string }
    const rows = await encounterService.listRecentByPatient(ctx, patientId)
    return reply.send({ data: rows })
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar atendimentos" })
  }
}

export async function aiDraft(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const draft = await suggestAttendanceDraftForEncounter(ctx, id)
    return reply.send(draft)
  } catch (error) {
    const mapped = mapError(error, reply)
    if (mapped) return mapped
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar rascunho com IA" })
  }
}
