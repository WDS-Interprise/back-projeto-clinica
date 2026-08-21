import type { FastifyRequest, FastifyReply } from "fastify"
import type { PixKeyType } from "@prisma/client"
import { ctxFromRequest } from "@/lib/auth-context.js"
import * as webhookRouter from "@/services/asaas-webhook.service.js"
import * as pay from "@/services/clinmax-pay.service.js"

function mapPayError(error: unknown, reply: FastifyReply) {
  const msg = error instanceof Error ? error.message : "UNKNOWN"
  if (msg === "PIX_NOT_CONFIRMED") {
    return reply.status(400).send({ error: "Confirme que a chave Pix pertence à clínica" })
  }
  if (msg === "INVALID_PIX_KEY") return reply.status(400).send({ error: "Chave Pix inválida" })
  if (msg === "DOCUMENT_KEY_MISMATCH") {
    return reply.status(400).send({ error: "Documento do titular deve coincidir com a chave CPF ou CNPJ" })
  }
  if (msg === "INVALID_DOCUMENT") return reply.status(400).send({ error: "Informe um CPF ou CNPJ válido do titular" })
  if (msg === "INVALID_RECIPIENT_NAME") return reply.status(400).send({ error: "Informe o nome do titular" })
  if (msg === "PIX_NOT_CONFIGURED") {
    return reply.status(400).send({ error: "Cadastre a chave Pix em Configurações → Financeiro" })
  }
  if (msg === "PIX_NOT_VERIFIED") return reply.status(400).send({ error: "Chave Pix ainda não validada" })
  if (msg === "ASAAS_NOT_CONFIGURED") {
    return reply.status(503).send({ error: "ClinMax Pay não está configurado no servidor (ASAAS_API_KEY)" })
  }
  if (msg === "INVALID_AMOUNT") return reply.status(400).send({ error: "Valor inválido" })
  if (msg === "PATIENT_REQUIRED") return reply.status(400).send({ error: "Consulta sem paciente" })
  if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Consulta não encontrada" })
  if (msg === "WEBHOOK_UNAUTHORIZED") return reply.status(401).send({ error: "Webhook não autorizado" })
  return reply.status(500).send({ error: "Erro no ClinMax Pay" })
}

export async function paySettingsGet(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await pay.getPaySettings(ctx))
  } catch (error) {
    req.log.error(error)
    return mapPayError(error, reply)
  }
}

export async function paySettingsPut(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const body = req.body as {
      pixKey: string
      pixKeyType?: PixKeyType
      recipientName: string
      recipientDocument: string
      enabled?: boolean
      confirmed: boolean
    }
    return reply.send(await pay.upsertPixRecipient(ctx, body))
  } catch (error) {
    req.log.error(error)
    return mapPayError(error, reply)
  }
}

export async function payEnabledPatch(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { enabled } = req.body as { enabled: boolean }
    return reply.send(await pay.setPayEnabled(ctx, Boolean(enabled)))
  } catch (error) {
    req.log.error(error)
    return mapPayError(error, reply)
  }
}

export async function appointmentPayGet(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    return reply.send({ pay: await pay.getAppointmentPay(ctx, id) })
  } catch (error) {
    req.log.error(error)
    return mapPayError(error, reply)
  }
}

export async function asaasWebhook(req: FastifyRequest, reply: FastifyReply) {
  try {
    const token = String(req.headers["asaas-access-token"] || req.headers["access_token"] || "")
    const result = await webhookRouter.handleAsaasWebhook((req.body as Record<string, unknown>) ?? {}, token)
    return reply.send(result)
  } catch (error) {
    req.log.error(error)
    return mapPayError(error, reply)
  }
}
