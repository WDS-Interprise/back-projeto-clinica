import { delay, type WASocket } from "@whiskeysockets/baileys"
import { getConnectedSocket } from "./manager.js"
import { resolveOutboundJid } from "./phone.js"

const composingChats = new Set<string>()

export function markChatAiComposing(chatId: string, active: boolean) {
  if (active) composingChats.add(chatId)
  else composingChats.delete(chatId)
}

function resolveJid(destination: string, remoteJid?: string) {
  return resolveOutboundJid({
    to: destination,
    remoteJid: remoteJid ?? (destination.includes("@") ? destination : undefined),
  })
}

async function subscribePresence(sock: WASocket, jid: string) {
  try {
    if (typeof sock.presenceSubscribe === "function") {
      await sock.presenceSubscribe(jid)
    }
  } catch {
    /* alguns JIDs não aceitam subscribe */
  }
}

/** Indicador "digitando..." no WhatsApp do paciente (Baileys). */
export async function sendComposingIndicator(
  connectionId: string,
  destination: string,
  remoteJid?: string
): Promise<void> {
  const sock = getConnectedSocket(connectionId)
  if (!sock) return

  const jid = resolveJid(destination, remoteJid)
  await subscribePresence(sock, jid)
  await sock.sendPresenceUpdate("composing", jid)
}

export async function sendPausedPresence(
  connectionId: string,
  destination: string,
  remoteJid?: string
): Promise<void> {
  const sock = getConnectedSocket(connectionId)
  if (!sock) return

  const jid = resolveJid(destination, remoteJid)
  await sock.sendPresenceUpdate("paused", jid)
}

/** Mantém "digitando" ativo e renova antes de expirar (~25s no WhatsApp). */
export async function runComposingForDuration(params: {
  connectionId: string
  destination: string
  remoteJid?: string
  durationMs: number
  renewEveryMs?: number
}): Promise<void> {
  const renewEveryMs = params.renewEveryMs ?? 4000
  const endAt = Date.now() + params.durationMs

  while (Date.now() < endAt) {
    await sendComposingIndicator(params.connectionId, params.destination, params.remoteJid)
    const remaining = endAt - Date.now()
    if (remaining <= 0) break
    await delay(Math.min(renewEveryMs, remaining))
  }
}

export function typingDurationFromText(text: string): number {
  const len = text.trim().length
  const base = Number(process.env.WHATSAPP_AI_TYPING_BASE_MS ?? 1200)
  const perChar = Number(process.env.WHATSAPP_AI_TYPING_PER_CHAR_MS ?? 35)
  const max = Number(process.env.WHATSAPP_AI_TYPING_MAX_MS ?? 9000)
  return Math.min(max, Math.max(base, base + len * perChar))
}
