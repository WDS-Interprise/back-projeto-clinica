import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import { WHATSAPP_STATUS } from "@/whatsapp/status.js"
import { getConnectedSocket, sendDocumentMessage, sendTextMessage } from "@/whatsapp/manager.js"
import { normalizeWhatsappPhone, phoneToJid, resolveOutboundJid, resolvePatientWhatsappDigits, tryNormalizeWhatsappPhone } from "@/whatsapp/phone.js"
import { isOpenRouterConfigured } from "@/lib/openrouter.js"
import { ensureChat, persistOutboundMessage } from "@/whatsapp/message-store.js"
import { getPatientWhatsappDigits } from "@/services/whatsapp-patient-phone.service.js"
import { ensureConnectionRuntime } from "@/services/whatsapp.service.js"

const USABLE_CONNECTION_STATUSES = [
  WHATSAPP_STATUS.CONNECTED,
  WHATSAPP_STATUS.CONNECTING,
] as const

async function findUsableConnection(clinicId: string, connectionId?: string) {
  const baseWhere = {
    clinicId,
    status: { in: [...USABLE_CONNECTION_STATUSES] },
    lastConnectedAt: { not: null },
  }

  if (connectionId) {
    return prisma.whatsappConnection.findFirst({
      where: { ...baseWhere, id: connectionId },
    })
  }

  const settings = await prisma.clinicWhatsappSettings.findUnique({
    where: { clinicId },
  })

  if (settings?.defaultConnectionId) {
    const preferred = await prisma.whatsappConnection.findFirst({
      where: { ...baseWhere, id: settings.defaultConnectionId },
    })
    if (preferred) return preferred
  }

  return prisma.whatsappConnection.findFirst({
    where: baseWhere,
    orderBy: { lastConnectedAt: "desc" },
  })
}

export async function resolveDefaultConnectionId(clinicId: string): Promise<string | null> {
  const conn = await findUsableConnection(clinicId)
  return conn?.id ?? null
}

export async function assertConnectionForClinic(clinicId: string, connectionId?: string) {
  const conn = await findUsableConnection(clinicId, connectionId)
  if (!conn) throw new Error("NO_WHATSAPP_CONNECTION")

  const runtimeReady = await ensureConnectionRuntime(conn.id)
  if (!runtimeReady || !getConnectedSocket(conn.id)) {
    throw new Error("WHATSAPP_SOCKET_OFFLINE")
  }
  return conn
}

async function reconcileChatPhoneDigits(clinicId: string) {
  const chats = await prisma.whatsappChat.findMany({
    where: { clinicId },
    select: { id: true, phoneDigits: true, connectionId: true },
  })
  for (const c of chats) {
    const canonical = tryNormalizeWhatsappPhone(c.phoneDigits) ?? c.phoneDigits
    if (canonical !== c.phoneDigits) {
      await prisma.whatsappChat.update({
        where: { id: c.id },
        data: { phoneDigits: canonical },
      })
    }
  }
  const refreshed = await prisma.whatsappChat.findMany({
    where: { clinicId },
    select: { id: true, phoneDigits: true, connectionId: true },
  })
  const byKey = new Map<string, string>()
  for (const c of refreshed) {
    const canonical = tryNormalizeWhatsappPhone(c.phoneDigits) ?? c.phoneDigits
    const key = `${c.connectionId}:${canonical}`
    const keeper = byKey.get(key)
    if (!keeper) {
      byKey.set(key, c.id)
      continue
    }
    await prisma.whatsappMessage.updateMany({
      where: { chatId: c.id },
      data: { chatId: keeper },
    })
    await prisma.whatsappChat.delete({ where: { id: c.id } })
  }
}

export async function listChats(ctx: AuthContext, params?: { patientId?: string }) {
  if (!ctx.clinicId) return []
  await reconcileChatPhoneDigits(ctx.clinicId)
  const activeConnectionId = await resolveDefaultConnectionId(ctx.clinicId)
  return prisma.whatsappChat.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...(activeConnectionId ? { connectionId: activeConnectionId } : {}),
      ...(params?.patientId ? { patientId: params.patientId } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, phone: true, whatsapp: true } },
      connection: { select: { id: true, name: true, status: true } },
    },
  })
}

export async function listChatMessages(ctx: AuthContext, chatId: string, limit = 80) {
  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, clinicId: ctx.clinicId ?? "" },
  })
  if (!chat) throw new Error("NOT_FOUND")

  await prisma.whatsappChat.update({
    where: { id: chatId },
    data: { unreadCount: 0 },
  })

  const messages = await prisma.whatsappMessage.findMany({
    where: { chatId },
    orderBy: { sentAt: "asc" },
    take: limit,
  })
  return { chat, messages }
}

export async function createChat(
  ctx: AuthContext,
  params: { patientId?: string; phone?: string }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")

  const connectionId = await resolveDefaultConnectionId(ctx.clinicId)
  if (!connectionId) throw new Error("NO_WHATSAPP_CONNECTION")

  if (!params.patientId && !params.phone?.trim()) {
    throw new Error("INVALID_INPUT")
  }

  let patientId: string | null = params.patientId ?? null
  let phoneDigits: string

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: ctx.clinicId, active: true },
      select: { id: true, phone: true, whatsapp: true },
    })
    if (!patient) throw new Error("PATIENT_NOT_FOUND")
    phoneDigits = resolvePatientWhatsappDigits(patient)
  } else {
    phoneDigits = normalizeWhatsappPhone(params.phone!)
  }

  const remoteJid = phoneToJid(phoneDigits)
  const chat = await ensureChat({
    connectionId,
    clinicId: ctx.clinicId,
    remoteJid,
    phoneDigits,
    patientId,
  })

  return prisma.whatsappChat.findUniqueOrThrow({
    where: { id: chat.id },
    include: {
      patient: { select: { id: true, name: true, phone: true, whatsapp: true } },
      connection: { select: { id: true, name: true, status: true } },
    },
  })
}

export async function sendMessageNow(params: {
  clinicId: string
  connectionId: string
  to?: string
  remoteJid?: string
  body: string
  patientId?: string | null
  templateId?: string | null
  appointmentId?: string | null
}) {
  const conn = await assertConnectionForClinic(params.clinicId, params.connectionId)

  let resolvedJid = params.remoteJid
  if (!resolvedJid && params.to?.trim()) {
    const chat = await prisma.whatsappChat.findFirst({
      where: {
        connectionId: conn.id,
        OR: [{ phoneDigits: params.to.trim() }, { remoteJid: params.to.trim() }],
      },
      select: { remoteJid: true },
    })
    resolvedJid = chat?.remoteJid
  }

  const jid = resolveOutboundJid({
    remoteJid: resolvedJid,
    to:
      params.to?.trim() ??
      (params.patientId
        ? await getPatientWhatsappDigits(params.clinicId, params.patientId)
        : undefined),
  })

  const phoneDigits = tryNormalizeWhatsappPhone(params.to ?? "") ?? jid.split("@")[0]?.replace(/\D/g, "") ?? ""

  const { messageId } = await sendTextMessage(conn.id, jid, params.body)

  await persistOutboundMessage({
    connectionId: conn.id,
    clinicId: params.clinicId,
    remoteJid: jid,
    phoneDigits,
    text: params.body,
    patientId: params.patientId,
    waMessageId: messageId,
  })

  return { connectionId: conn.id, jid, messageId }
}

export async function sendDocumentNow(params: {
  clinicId: string
  connectionId: string
  to: string
  buffer: Buffer
  fileName: string
  mimetype: string
  caption?: string
  patientId?: string | null
  appointmentId?: string | null
}) {
  const conn = await assertConnectionForClinic(params.clinicId, params.connectionId)
  const digits = normalizeWhatsappPhone(params.to)
  const jid = phoneToJid(digits)

  const { messageId } = await sendDocumentMessage(conn.id, digits, params.buffer, {
    fileName: params.fileName,
    mimetype: params.mimetype,
    caption: params.caption,
  })

  await persistOutboundMessage({
    connectionId: conn.id,
    clinicId: params.clinicId,
    remoteJid: jid,
    phoneDigits: digits,
    text: params.caption ?? `[Documento] ${params.fileName}`,
    patientId: params.patientId,
    waMessageId: messageId,
  })

  return { connectionId: conn.id, jid, messageId }
}

export async function enqueueOutbox(params: {
  clinicId: string
  connectionId: string
  to: string
  body: string
  templateId?: string | null
  appointmentId?: string | null
  offsetHours?: number | null
  scheduledAt?: Date
}) {
  return prisma.whatsappOutbox.create({
    data: {
      clinicId: params.clinicId,
      connectionId: params.connectionId,
      to: normalizeWhatsappPhone(params.to),
      body: params.body,
      templateId: params.templateId ?? null,
      appointmentId: params.appointmentId ?? null,
      offsetHours: params.offsetHours ?? null,
      scheduledAt: params.scheduledAt ?? new Date(),
      status: "PENDING",
    },
  })
}

export async function processOutboxItem(outboxId: string) {
  const item = await prisma.whatsappOutbox.findUnique({ where: { id: outboxId } })
  if (!item || item.status !== "PENDING") return

  let connectionId = item.connectionId
  const linked = await prisma.whatsappConnection.findFirst({
    where: { id: connectionId, clinicId: item.clinicId, status: WHATSAPP_STATUS.CONNECTED },
  })
  if (!linked) {
    const fallback = await resolveDefaultConnectionId(item.clinicId)
    if (!fallback) {
      await prisma.whatsappOutbox.update({
        where: { id: outboxId },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          errorMessage: "WHATSAPP_NOT_CONNECTED",
        },
      })
      return false
    }
    connectionId = fallback
  }

  try {
    await sendMessageNow({
      clinicId: item.clinicId,
      connectionId,
      to: item.to,
      body: item.body,
      appointmentId: item.appointmentId,
      templateId: item.templateId,
    })
    await prisma.whatsappOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), errorMessage: null },
    })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao enviar"
    await prisma.whatsappOutbox.update({
      where: { id: outboxId },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        errorMessage: msg,
      },
    })
    return false
  }
}

export async function processPendingOutbox(limit = 20) {
  const pending = await prisma.whatsappOutbox.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  })
  for (const item of pending) {
    await processOutboxItem(item.id)
  }
}

export async function sendFromContext(
  ctx: AuthContext,
  data: {
    to: string
    message: string
    connectionId?: string
    patientId?: string
    templateId?: string
    remoteJid?: string
  }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const conn = await assertConnectionForClinic(ctx.clinicId, data.connectionId)

  let remoteJid = data.remoteJid
  if (!remoteJid && data.to?.trim()) {
    const chat = await prisma.whatsappChat.findFirst({
      where: {
        clinicId: ctx.clinicId,
        connectionId: conn.id,
        OR: [{ phoneDigits: data.to.trim() }, { remoteJid: data.to.trim() }],
      },
      select: { remoteJid: true, phoneDigits: true },
    })
    remoteJid = chat?.remoteJid
  }

  const result = await sendMessageNow({
    clinicId: ctx.clinicId,
    connectionId: conn.id,
    to: data.to,
    remoteJid,
    body: data.message,
    patientId: data.patientId,
    templateId: data.templateId,
  })

  const pauseDigits =
    tryNormalizeWhatsappPhone(data.to) ?? remoteJid?.split("@")[0] ?? data.to
  await prisma.whatsappChat.updateMany({
    where: {
      clinicId: ctx.clinicId,
      connectionId: conn.id,
      OR: [{ phoneDigits: pauseDigits }, ...(remoteJid ? [{ remoteJid }] : [])],
    },
    data: { aiPaused: true },
  })
  return result
}

export async function getSettings(ctx: AuthContext) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const { ensureDefaultWhatsappTemplates } = await import("./whatsapp-template.service.js")
  await ensureDefaultWhatsappTemplates(ctx.clinicId)
  const aiDefaults = isOpenRouterConfigured()
    ? { aiAssistantEnabled: true, aiAutoReplyEnabled: true }
    : {}
  const settings = await prisma.clinicWhatsappSettings.upsert({
    where: { clinicId: ctx.clinicId },
    create: { clinicId: ctx.clinicId, ...aiDefaults },
    update: {},
  })
  const connections = await prisma.whatsappConnection.findMany({
    where: { clinicId: ctx.clinicId },
    select: { id: true, name: true, status: true, phoneNumber: true },
  })
  let reminderOffsets: number[] = [24]
  try {
    reminderOffsets = JSON.parse(settings.reminderOffsetsJson) as number[]
  } catch {
    /* default */
  }
  return { ...settings, reminderOffsets, connections }
}

export async function updateSettings(
  ctx: AuthContext,
  data: {
    defaultConnectionId?: string | null
    reminderOffsets?: number[]
    autoRemindersEnabled?: boolean
    aiAssistantEnabled?: boolean
    aiAutoReplyEnabled?: boolean
  }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const patch: Record<string, unknown> = {}
  if (data.defaultConnectionId !== undefined) patch.defaultConnectionId = data.defaultConnectionId
  if (data.autoRemindersEnabled !== undefined) patch.autoRemindersEnabled = data.autoRemindersEnabled
  if (data.aiAssistantEnabled !== undefined) patch.aiAssistantEnabled = data.aiAssistantEnabled
  if (data.aiAutoReplyEnabled !== undefined) patch.aiAutoReplyEnabled = data.aiAutoReplyEnabled
  if (data.reminderOffsets !== undefined) {
    patch.reminderOffsetsJson = JSON.stringify(
      data.reminderOffsets.filter((h) => h > 0).sort((a, b) => b - a)
    )
  }
  return prisma.clinicWhatsappSettings.upsert({
    where: { clinicId: ctx.clinicId },
    create: {
      clinicId: ctx.clinicId,
      ...patch,
    },
    update: patch,
  })
}
