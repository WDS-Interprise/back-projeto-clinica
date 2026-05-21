import type { proto } from "@whiskeysockets/baileys"
import { extractMessageContent, getContentType } from "@whiskeysockets/baileys"
import prisma from "@/lib/prisma.js"
import {
  jidToPhoneDigits,
  tryNormalizeWhatsappPhone,
} from "./phone.js"

function extractText(message: proto.IMessage | null | undefined): string {
  if (!message) return ""
  const content = extractMessageContent(message)
  if (!content) return ""
  const type = getContentType(content)
  if (type === "conversation" && content.conversation) return content.conversation
  if (type === "extendedTextMessage" && content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text
  }
  if (type === "imageMessage") return content.imageMessage?.caption || "[imagem]"
  if (type === "videoMessage") return content.videoMessage?.caption || "[vídeo]"
  if (type === "audioMessage") return "[áudio]"
  if (type === "documentMessage") {
    return content.documentMessage?.fileName || "[documento]"
  }
  return "[mensagem]"
}

async function findPatientByPhone(clinicId: string, phoneDigits: string) {
  const target =
    tryNormalizeWhatsappPhone(phoneDigits) ?? phoneDigits.replace(/\D/g, "")
  if (!target) return null

  const patients = await prisma.patient.findMany({
    where: { clinicId, active: true },
    select: { id: true, phone: true, whatsapp: true },
  })
  for (const p of patients) {
    for (const raw of [p.whatsapp, p.phone]) {
      const normalized = tryNormalizeWhatsappPhone(raw ?? "")
      if (normalized && normalized === target) return p.id
    }
  }
  return null
}

async function findExistingChatByPhone(connectionId: string, phoneDigits: string) {
  const canonical =
    tryNormalizeWhatsappPhone(phoneDigits) ?? phoneDigits.replace(/\D/g, "")
  if (!canonical) return null
  return prisma.whatsappChat.findFirst({
    where: { connectionId, phoneDigits: canonical },
    include: { patient: { select: { id: true, name: true } } },
  })
}

async function dedupeByWaMessageId(connectionId: string, waMessageId: string | null | undefined) {
  if (!waMessageId) return null
  return prisma.whatsappMessage.findFirst({
    where: {
      waMessageId,
      chat: { connectionId },
    },
    include: { chat: { include: { patient: { select: { id: true, name: true } } } } },
  })
}

export async function ensureChat(params: {
  connectionId: string
  clinicId: string
  remoteJid: string
  phoneDigits?: string
  patientId?: string | null
}) {
  const fromJid = jidToPhoneDigits(params.remoteJid)
  const phoneDigits =
    tryNormalizeWhatsappPhone(params.phoneDigits ?? fromJid) ?? fromJid.replace(/\D/g, "")

  let patientId = params.patientId ?? null
  if (!patientId) {
    patientId = await findPatientByPhone(params.clinicId, phoneDigits)
  }

  const existingByPhone = await findExistingChatByPhone(params.connectionId, phoneDigits)
  if (existingByPhone) {
    return prisma.whatsappChat.update({
      where: { id: existingByPhone.id },
      data: {
        remoteJid: params.remoteJid,
        phoneDigits,
        ...(patientId ? { patientId } : {}),
      },
      include: { patient: { select: { id: true, name: true } } },
    })
  }

  return prisma.whatsappChat.upsert({
    where: {
      connectionId_remoteJid: {
        connectionId: params.connectionId,
        remoteJid: params.remoteJid,
      },
    },
    create: {
      connectionId: params.connectionId,
      clinicId: params.clinicId,
      remoteJid: params.remoteJid,
      phoneDigits,
      patientId,
    },
    update: {
      phoneDigits,
      ...(patientId ? { patientId } : {}),
    },
    include: { patient: { select: { id: true, name: true } } },
  })
}

export async function persistInboundMessage(params: {
  connectionId: string
  clinicId: string
  remoteJid: string
  waMessageId?: string | null
  fromMe: boolean
  text: string
  sentAt?: Date
}) {
  const dup = await dedupeByWaMessageId(params.connectionId, params.waMessageId)
  if (dup) return { chat: dup.chat, message: dup }

  const chat = await ensureChat({
    connectionId: params.connectionId,
    clinicId: params.clinicId,
    remoteJid: params.remoteJid,
  })

  const msg = await prisma.whatsappMessage.create({
    data: {
      chatId: chat.id,
      waMessageId: params.waMessageId ?? null,
      fromMe: params.fromMe,
      type: "text",
      content: params.text,
      status: params.fromMe ? "SENT" : "RECEIVED",
      sentAt: params.sentAt ?? new Date(),
    },
  })

  await prisma.whatsappChat.update({
    where: { id: chat.id },
    data: {
      lastMessage: params.text.slice(0, 500),
      lastMessageAt: params.sentAt ?? new Date(),
      unreadCount: params.fromMe ? chat.unreadCount : chat.unreadCount + 1,
    },
  })

  return { chat, message: msg }
}

export async function persistOutboundMessage(params: {
  connectionId: string
  clinicId: string
  remoteJid: string
  phoneDigits: string
  text: string
  patientId?: string | null
  waMessageId?: string | null
}) {
  const dup = await dedupeByWaMessageId(params.connectionId, params.waMessageId)
  if (dup) return { chat: dup.chat, message: dup }

  const chat = await ensureChat({
    connectionId: params.connectionId,
    clinicId: params.clinicId,
    remoteJid: params.remoteJid,
    phoneDigits: params.phoneDigits,
    patientId: params.patientId,
  })

  const msg = await prisma.whatsappMessage.create({
    data: {
      chatId: chat.id,
      waMessageId: params.waMessageId ?? null,
      fromMe: true,
      type: "text",
      content: params.text,
      status: "SENT",
      sentAt: new Date(),
    },
  })

  await prisma.whatsappChat.update({
    where: { id: chat.id },
    data: {
      lastMessage: params.text.slice(0, 500),
      lastMessageAt: new Date(),
    },
  })

  return { chat, message: msg }
}

export async function handleMessagesUpsert(
  connectionId: string,
  clinicId: string,
  messages: proto.IWebMessageInfo[]
) {
  for (const msg of messages) {
    const key = msg.key
    if (!msg.message || !key?.remoteJid || key.remoteJid.endsWith("@g.us")) continue
    if (key.fromMe) continue
    const remoteJid = key.remoteJid
    const text = extractText(msg.message)
    if (!text) continue
    await persistInboundMessage({
      connectionId,
      clinicId,
      remoteJid,
      waMessageId: key.id ?? null,
      fromMe: !!key.fromMe,
      text,
      sentAt: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date(),
    })
  }
}
