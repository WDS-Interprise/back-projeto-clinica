import type { FastifyRequest, FastifyReply } from "fastify"
import * as appointmentService from "@/services/appointment.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as JwtPayload
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function list(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as Record<string, string | undefined>
    const result = await appointmentService.list(ctx, {
      date: q.date,
      startDate: q.startDate,
      endDate: q.endDate,
      doctorId: q.doctorId,
      patientId: q.patientId,
      status: q.status,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 200,
    })
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar consultas" })
  }
}

export async function getById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const appointment = await appointmentService.getById(ctx, id)
    if (!appointment) {
      return reply.status(404).send({ error: "Consulta nao encontrada" })
    }
    return reply.send(appointment)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar consulta" })
  }
}

export async function create(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const appointment = await appointmentService.create(ctx, req.body as any)
    return reply.status(201).send(appointment)
  } catch (error: any) {
    if (error.message === "DOCTOR_NOT_LINKED" || error.message === "DOCTOR_NOT_ALLOWED") {
      return reply.status(403).send({ error: "Profissional nao permitido" })
    }
    if (error.message === "LUNCH_HOURS") {
      return reply.status(400).send({ error: "Horario de almoco — nao e possivel agendar consultas" })
    }
    if (error.message === "OUTSIDE_WORK_HOURS") {
      return reply.status(400).send({ error: "Horario fora do expediente da clinica" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar consulta" })
  }
}

export async function update(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = req.body as {
      cidCode?: string | null
      cidDescription?: string | null
      cidVersion?: string | null
    }
    const appointment = await appointmentService.update(ctx, id, req.body as any)
    if (!appointment) {
      return reply.status(404).send({ error: "Consulta nao encontrada" })
    }
    if (body.cidCode !== undefined) {
      const { writeAuditLog } = await import("@/lib/audit-log.js")
      await writeAuditLog({
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        module: "Atendimento",
        action: body.cidCode ? "CID_USADO" : "CID_REMOVIDO",
        entityType: "Appointment",
        entityId: id,
        description: body.cidCode
          ? `CID ${body.cidCode} vinculado ao atendimento`
          : "CID removido do atendimento",
        metadata: {
          cidCode: body.cidCode,
          cidDescription: body.cidDescription,
          cidVersion: body.cidVersion,
        },
      })
    }
    return reply.send(appointment)
  } catch (error: any) {
    if (error.message === "DOCTOR_NOT_LINKED") {
      return reply.status(403).send({ error: "Profissional nao permitido" })
    }
    if (error.message === "APPOINTMENT_CLOSED") {
      return reply.status(400).send({ error: "Atendimento finalizado — CID não pode ser alterado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar consulta" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await appointmentService.remove(ctx, id)
    return reply.status(204).send()
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Consulta nao encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover consulta" })
  }
}

export async function charge(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = (req.body as { amount?: number }) ?? {}
    const billing = await appointmentService.charge(ctx, id, body.amount)
    return reply.send(billing)
  } catch (error: any) {
    if (error.message === "BILLING_NOT_FOUND" || error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Cobranca nao encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar cobranca" })
  }
}

export async function receipt(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const billing = await appointmentService.receipt(ctx, id)
    return reply.send(billing)
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Consulta nao encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao lancar recebimento" })
  }
}

export async function nextSlot(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as { doctorId?: string; date?: string }
    if (!q.doctorId || !q.date) {
      return reply.status(400).send({ error: "doctorId e date sao obrigatorios" })
    }
    const slot = await appointmentService.findNextFreeSlot(ctx, q.doctorId, q.date)
    return reply.send(slot)
  } catch (error: any) {
    if (error.message === "DOCTOR_NOT_LINKED" || error.message === "DOCTOR_NOT_ALLOWED") {
      return reply.status(403).send({ error: "Profissional nao permitido" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar horario" })
  }
}

export async function reminder(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = (req.body as { templateId?: string; body?: string }) ?? {}
    const appointment = await appointmentService.sendReminder(ctx, id, body)
    return reply.send(appointment)
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Consulta nao encontrada" })
    }
    if (error.message === "NO_PHONE") {
      return reply.status(400).send({ error: "Paciente sem telefone/WhatsApp cadastrado" })
    }
    if (error.message === "NO_WHATSAPP_CONNECTION" || error.message === "WHATSAPP_NOT_CONNECTED") {
      return reply.status(400).send({
        error: "WhatsApp não conectado. Configure em Configurações → WhatsApp.",
      })
    }
    if (error.message === "WHATSAPP_SOCKET_OFFLINE") {
      return reply.status(503).send({
        error: "Sessão WhatsApp offline no servidor. Reconecte o número.",
      })
    }
    if (error.message === "NO_TEMPLATE") {
      return reply.status(400).send({ error: "Nenhum template de lembrete configurado" })
    }
    if (error.message === "INVALID_PHONE") {
      return reply.status(400).send({
        error: "Telefone do paciente inválido. Use DDD + número (ex.: 62999999999).",
      })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao enviar lembrete" })
  }
}
