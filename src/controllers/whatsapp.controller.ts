import type { FastifyRequest, FastifyReply } from "fastify"
import { buildAuthContext } from "@/lib/auth-context.js"
import type { JwtPayload } from "@/types/index.js"
import * as whatsappService from "@/services/whatsapp.service.js"
import * as messagingService from "@/services/whatsapp-messaging.service.js"
import * as templateService from "@/services/whatsapp-template.service.js"
import { setChatAiPaused } from "@/services/whatsapp-ai.service.js"
import { getChatAvatarBuffer } from "@/services/whatsapp-contact-profile.service.js"
import { isOpenRouterConfigured } from "@/lib/openrouter.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as JwtPayload
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function listConnections(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    return reply.send(await whatsappService.listConnections(ctx))
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar conexões WhatsApp" })
  }
}

export async function createConnection(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const body = req.body as { name?: string; connectionType?: "QR" | "PAIRING" }
    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: "Nome da conexão é obrigatório" })
    }
    const row = await whatsappService.createConnection(ctx, {
      name: body.name,
      connectionType: body.connectionType,
    })
    return reply.status(201).send(row)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NO_CLINIC") {
      return reply.status(400).send({ error: "Clínica não identificada na sessão" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar conexão" })
  }
}

export async function getStatus(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    return reply.send(await whatsappService.getConnectionStatus(ctx, id))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao consultar status" })
  }
}

export async function startQr(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    return reply.send(await whatsappService.startQr(ctx, id))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar QR Code" })
  }
}

export async function startPairing(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = req.body as { phone_number?: string; phoneNumber?: string }
    const phone = body?.phone_number ?? body?.phoneNumber ?? ""
    if (!phone.replace(/\D/g, "")) {
      return reply.status(400).send({ error: "Informe o número do WhatsApp" })
    }
    return reply.send(await whatsappService.startPairing(ctx, id, phone))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    if (error instanceof Error && error.message === "INVALID_PHONE") {
      return reply.status(400).send({ error: "Número de telefone inválido" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar código de pareamento" })
  }
}

export async function disconnect(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    return reply.send(await whatsappService.disconnect(ctx, id))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao desconectar" })
  }
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    return reply.send(await whatsappService.logout(ctx, id))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao encerrar sessão" })
  }
}

function mapMessagingError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof Error)) return false
  const m = error.message
  if (m === "NOT_FOUND") {
    reply.status(404).send({ error: "Não encontrado" })
    return true
  }
  if (m === "NO_WHATSAPP_CONNECTION" || m === "WHATSAPP_NOT_CONNECTED") {
    reply.status(400).send({
      error: "Nenhum WhatsApp conectado. Vá em Configurações → WhatsApp e conecte um número.",
    })
    return true
  }
  if (m === "WHATSAPP_SOCKET_OFFLINE") {
    reply.status(503).send({
      error: "WhatsApp desconectado no servidor. Reconecte em Configurações → WhatsApp.",
    })
    return true
  }
  if (m === "INVALID_PHONE") {
    reply.status(400).send({ error: "Número de telefone inválido" })
    return true
  }
  if (m === "PATIENT_NOT_FOUND") {
    reply.status(404).send({ error: "Paciente não encontrado" })
    return true
  }
  if (m === "NO_PHONE") {
    reply.status(400).send({ error: "Paciente sem telefone ou WhatsApp cadastrado" })
    return true
  }
  if (m === "INVALID_INPUT") {
    reply.status(400).send({ error: "Informe um paciente ou número de telefone" })
    return true
  }
  return false
}

export async function listChats(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as { patientId?: string }
    return reply.send(await messagingService.listChats(ctx, { patientId: q.patientId }))
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar conversas" })
  }
}

export async function createChat(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const body = req.body as { patientId?: string; phone?: string }
    const chat = await messagingService.createChat(ctx, {
      patientId: body.patientId,
      phone: body.phone,
    })
    return reply.status(201).send(chat)
  } catch (error: unknown) {
    if (mapMessagingError(error, reply)) return
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar conversa" })
  }
}

export async function getChatAvatar(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    if (!ctx.clinicId) {
      return reply.status(400).send({ error: "Clínica não identificada" })
    }
    const { chatId } = req.params as { chatId: string }
    const result = await getChatAvatarBuffer(ctx.clinicId, chatId)
    if (!result) {
      return reply.status(404).send({ error: "Foto não disponível" })
    }
    return reply
      .header("Content-Type", result.contentType)
      .header("Cache-Control", "private, max-age=3600")
      .send(result.buffer)
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao carregar foto" })
  }
}

export async function setChatComposing(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { chatId } = req.params as { chatId: string }
    const body = req.body as { active?: boolean }
    await messagingService.setStaffComposing(ctx, chatId, body?.active !== false)
    return reply.send({ ok: true })
  } catch (error: unknown) {
    if (mapMessagingError(error, reply)) return
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar digitação" })
  }
}

export async function listChatMessages(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { chatId } = req.params as { chatId: string }
    return reply.send(await messagingService.listChatMessages(ctx, chatId))
  } catch (error: unknown) {
    if (mapMessagingError(error, reply)) return
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao carregar mensagens" })
  }
}

export async function sendMessage(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = req.body as {
      to?: string
      message?: string
      patientId?: string
      templateId?: string
      remoteJid?: string
    }
    if (!body?.to?.trim() || !body?.message?.trim()) {
      return reply.status(400).send({ error: "Informe destino e mensagem" })
    }
    const result = await messagingService.sendFromContext(ctx, {
      to: body.to,
      message: body.message,
      connectionId: id,
      patientId: body.patientId,
      templateId: body.templateId,
      remoteJid: body.remoteJid,
    })
    return reply.send(result)
  } catch (error: unknown) {
    if (mapMessagingError(error, reply)) return
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao enviar mensagem" })
  }
}

export async function listTemplates(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    return reply.send(await templateService.listTemplates(ctx))
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar templates" })
  }
}

export async function createTemplate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const body = req.body as { name?: string; body?: string; category?: string }
    if (!body?.name?.trim() || !body?.body?.trim()) {
      return reply.status(400).send({ error: "Nome e texto do template são obrigatórios" })
    }
    const row = await templateService.createTemplate(ctx, {
      name: body.name,
      body: body.body,
      category: body.category,
    })
    return reply.status(201).send(row)
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao criar template" })
  }
}

export async function updateTemplate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; body: string; category: string; active: boolean }>
    return reply.send(await templateService.updateTemplate(ctx, id, body))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Template não encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar template" })
  }
}

export async function deleteTemplate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await templateService.deleteTemplate(ctx, id)
    return reply.status(204).send()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Template não encontrado" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover template" })
  }
}

export async function getSettings(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const settings = await messagingService.getSettings(ctx)
    return reply.send({ ...settings, openRouterConfigured: isOpenRouterConfigured() })
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao carregar configurações" })
  }
}

export async function updateSettings(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const body = req.body as {
      defaultConnectionId?: string | null
      reminderOffsets?: number[]
      autoRemindersEnabled?: boolean
      aiAssistantEnabled?: boolean
      aiAutoReplyEnabled?: boolean
    }
    await messagingService.updateSettings(ctx, body)
    const settings = await messagingService.getSettings(ctx)
    return reply.send({ ...settings, openRouterConfigured: isOpenRouterConfigured() })
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao salvar configurações" })
  }
}

export async function updateChatAi(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { chatId } = req.params as { chatId: string }
    const body = req.body as { aiPaused?: boolean }
    if (body.aiPaused === undefined) {
      return reply.status(400).send({ error: "Informe aiPaused" })
    }
    if (!ctx.clinicId) return reply.status(400).send({ error: "Clínica não identificada" })
    const chat = await setChatAiPaused(chatId, ctx.clinicId, body.aiPaused)
    return reply.send(chat)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conversa não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao atualizar assistente" })
  }
}

export async function previewTemplate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = req.body as { body?: string; context?: templateService.TemplateContext }
    if (!body?.body) return reply.status(400).send({ error: "Texto obrigatório" })
    return reply.send({
      rendered: templateService.renderTemplate(body.body, body.context ?? {}),
    })
  } catch (error: unknown) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao gerar preview" })
  }
}

export async function remove(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const { id } = req.params as { id: string }
    await whatsappService.removeConnection(ctx, id)
    return reply.status(204).send()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return reply.status(404).send({ error: "Conexão não encontrada" })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao remover conexão" })
  }
}
