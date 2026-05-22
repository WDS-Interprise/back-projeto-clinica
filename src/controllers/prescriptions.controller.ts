import type { FastifyRequest, FastifyReply } from "fastify"
import { ctxFromRequest } from "@/lib/auth-context.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import * as prescriptionService from "@/services/prescription.service.js"

function auditFromReq(
  req: FastifyRequest,
  data: {
    action: string
    description: string
    entityId?: string
    metadata?: Record<string, unknown>
  }
) {
  const payload = req.user as { userId: string; clinicId?: string }
  return writeAuditLog({
    clinicId: payload.clinicId,
    userId: payload.userId,
    module: "Prescricoes",
    action: data.action,
    entityType: "Prescription",
    entityId: data.entityId,
    description: data.description,
    metadata: data.metadata,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  })
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as Record<string, string | undefined>
    const result = await prescriptionService.list(ctx, {
      patientId: q.patientId,
      appointmentId: q.appointmentId,
      status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
    })
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar prescrições" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const rx = await prescriptionService.getById(ctx, id)
    return reply.send(rx)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Prescrição não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar prescrição" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const rx = await prescriptionService.createDraft(ctx, req.body as Parameters<typeof prescriptionService.createDraft>[1])
    await auditFromReq(req, {
      action: "CRIAR",
      description: `Rascunho de prescrição criado para paciente ${rx.patientId}`,
      entityId: rx.id,
    })
    return reply.status(201).send(rx)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "PATIENT_NOT_FOUND") {
        return reply.status(404).send({ error: "Paciente não encontrado" })
      }
      if (error.message === "APPOINTMENT_NOT_FOUND") {
        return reply.status(404).send({ error: "Atendimento não encontrado" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar prescrição" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const rx = await prescriptionService.update(ctx, id, req.body as Parameters<typeof prescriptionService.update>[2])
    return reply.send(rx)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "Prescrição não encontrada" })
      }
      if (error.message === "NOT_EDITABLE") {
        return reply.status(400).send({ error: "Prescrição finalizada não pode ser editada" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar prescrição" })
  }
}

export async function addItem(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const result = await prescriptionService.addItem(ctx, id, req.body as Parameters<typeof prescriptionService.addItem>[2])
    return reply.status(201).send(result)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "Prescrição não encontrada" })
      }
      if (error.message === "NOT_EDITABLE") {
        return reply.status(400).send({ error: "Prescrição finalizada não pode ser editada" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao adicionar item" })
  }
}

export async function removeItem(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id, itemId } = req.params as { id: string; itemId: string }
    const rx = await prescriptionService.removeItem(ctx, id, itemId)
    return reply.send(rx)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND" || error.message === "ITEM_NOT_FOUND") {
        return reply.status(404).send({ error: "Item ou prescrição não encontrado" })
      }
      if (error.message === "NOT_EDITABLE") {
        return reply.status(400).send({ error: "Prescrição finalizada não pode ser editada" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover item" })
  }
}

export async function finalize(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const rx = await prescriptionService.finalize(ctx, id, req.body as Parameters<typeof prescriptionService.finalize>[2])
    await auditFromReq(req, {
      action: "FINALIZAR",
      description: `Prescrição finalizada (${rx.validationCode})`,
      entityId: rx.id,
      metadata: { shareWhatsApp: Boolean((req.body as { shareWhatsApp?: boolean })?.shareWhatsApp) },
    })
    return reply.send(rx)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "Prescrição não encontrada" })
      }
      if (error.message === "NO_ITEMS") {
        return reply.status(400).send({ error: "Adicione ao menos um item antes de finalizar" })
      }
      if (error.message === "ALREADY_FINALIZED") {
        return reply.status(400).send({ error: "Prescrição já finalizada" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao finalizar prescrição" })
  }
}

export async function renew(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const rx = await prescriptionService.renew(ctx, id)
    await auditFromReq(req, {
      action: "RENOVAR",
      description: `Prescrição renovada a partir de ${id}`,
      entityId: rx.id,
    })
    return reply.status(201).send(rx)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Prescrição não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao renovar prescrição" })
  }
}

export async function getPdf(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const { buffer, filename } = await prescriptionService.getPdfFile(ctx, id)
    reply.header("Content-Type", "application/pdf")
    reply.header("Content-Disposition", `attachment; filename="${filename}"`)
    return reply.send(buffer)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "Prescrição não encontrada" })
      }
      if (error.message === "PDF_NOT_READY") {
        return reply.status(400).send({ error: "PDF ainda não disponível" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar PDF" })
  }
}

export async function listTemplates(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const result = await prescriptionService.listTemplates(ctx)
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar modelos" })
  }
}

export async function resolveContext(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { routeId } = req.params as { routeId: string }
    const resolved = await prescriptionService.resolvePatientFromRouteId(ctx, routeId)
    if (!resolved) {
      return reply.status(404).send({ error: "Paciente ou atendimento não encontrado" })
    }
    const patient = await prescriptionService.list(ctx, {
      patientId: resolved.patientId,
      limit: 10,
    })
    return reply.send({ ...resolved, recentPrescriptions: patient.data })
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao resolver contexto" })
  }
}

export async function validatePublic(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = req.params as { code: string }
    const q = req.query as { accessCode?: string }
    const result = await prescriptionService.validatePublic(code, q.accessCode)
    if (!result.valid) {
      return reply.status(404).send({ valid: false, reason: result.reason })
    }
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro na validação" })
  }
}

export async function resendWhatsapp(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { phone?: string }
    const rx = await prescriptionService.resendWhatsApp(ctx, id, body.phone)
    await auditFromReq(req, {
      action: "REENVIAR_WHATSAPP",
      description: `Reenvio WhatsApp da prescrição ${rx.validationCode}`,
      entityId: rx.id,
    })
    return reply.send(rx)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "Prescrição não encontrada" })
      }
      if (error.message === "NOT_FINALIZED") {
        return reply.status(400).send({ error: "Prescrição ainda não foi finalizada" })
      }
      if (error.message === "NO_PHONE") {
        return reply.status(400).send({ error: "Telefone do paciente não informado" })
      }
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao reenviar WhatsApp" })
  }
}
