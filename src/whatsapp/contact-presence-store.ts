/** Presença do contato (paciente) recebida via Baileys — ex.: digitando no WhatsApp. */
const composingUntilByJid = new Map<string, number>()

const COMPOSING_TTL_MS = 25_000

export function setContactComposing(remoteJid: string, composing: boolean) {
  if (!composing) {
    composingUntilByJid.delete(remoteJid)
    return
  }
  composingUntilByJid.set(remoteJid, Date.now() + COMPOSING_TTL_MS)
}

export function isContactComposing(remoteJid: string): boolean {
  const until = composingUntilByJid.get(remoteJid)
  if (!until) return false
  if (Date.now() > until) {
    composingUntilByJid.delete(remoteJid)
    return false
  }
  return true
}
