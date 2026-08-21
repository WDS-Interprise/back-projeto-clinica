import prisma from "@/lib/prisma.js"
import { resolvePatientWhatsappDigits } from "@/whatsapp/phone.js"

export async function getPatientWhatsappDigits(
  clinicId: string,
  patientId: string
): Promise<string> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId, active: true },
    select: { phone: true, whatsapp: true },
  })
  if (!patient) throw new Error("PATIENT_NOT_FOUND")
  return resolvePatientWhatsappDigits(patient)
}

const patientChatSelect = {
  remoteJid: true,
  phoneDigits: true,
  connectionId: true,
} as const

/** Conversa WhatsApp vinculada ao paciente (prioriza a conexão ativa). */
export async function findPatientWhatsappChat(
  clinicId: string,
  patientId: string,
  connectionId?: string
) {
  if (connectionId) {
    const onConnection = await prisma.whatsappChat.findFirst({
      where: { clinicId, patientId, connectionId },
      orderBy: { lastMessageAt: "desc" },
      select: patientChatSelect,
    })
    if (onConnection) return onConnection
  }

  return prisma.whatsappChat.findFirst({
    where: { clinicId, patientId },
    orderBy: { lastMessageAt: "desc" },
    select: patientChatSelect,
  })
}

export type PatientOutboundTarget = {
  remoteJid?: string
  to: string
  phoneDigits: string
}

/**
 * Destino de envio ao paciente: usa a conversa WhatsApp existente (incl. @lid)
 * em vez do telefone do cadastro, quando houver chat vinculado.
 */
export async function resolvePatientOutboundTarget(params: {
  clinicId: string
  patientId: string
  connectionId?: string
}): Promise<PatientOutboundTarget> {
  const chat = await findPatientWhatsappChat(
    params.clinicId,
    params.patientId,
    params.connectionId
  )
  if (chat) {
    return {
      remoteJid: chat.remoteJid,
      to: chat.phoneDigits,
      phoneDigits: chat.phoneDigits,
    }
  }

  const digits = await getPatientWhatsappDigits(params.clinicId, params.patientId)
  return { to: digits, phoneDigits: digits }
}
