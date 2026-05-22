/** Número internacional sem + (ex.: 5562999999999). */
export function normalizeWhatsappPhone(input: string): string {
  let digits = input.replace(/\D/g, "")
  if (!digits) throw new Error("INVALID_PHONE")
  if (digits.startsWith("55")) {
    if (digits.length < 12 || digits.length > 13) throw new Error("INVALID_PHONE")
    return digits
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }
  throw new Error("INVALID_PHONE")
}

export function tryNormalizeWhatsappPhone(input: string | null | undefined): string | null {
  if (!input?.trim()) return null
  try {
    return normalizeWhatsappPhone(input)
  } catch {
    return null
  }
}

export function phonesAreSame(a: string, b: string): boolean {
  const na = tryNormalizeWhatsappPhone(a)
  const nb = tryNormalizeWhatsappPhone(b)
  return !!na && !!nb && na === nb
}

/** WhatsApp do paciente; prioriza campo whatsapp. */
export function pickPatientWhatsappRaw(patient: {
  whatsapp?: string | null
  phone?: string | null
}): string | null {
  const w = patient.whatsapp?.trim()
  if (w) return w
  const p = patient.phone?.trim()
  return p || null
}

export function resolvePatientWhatsappDigits(patient: {
  whatsapp?: string | null
  phone?: string | null
}): string {
  const raw = pickPatientWhatsappRaw(patient)
  if (!raw) throw new Error("NO_PHONE")
  return normalizeWhatsappPhone(raw)
}

export function phoneToJid(digits: string): string {
  const d = digits.replace(/\D/g, "")
  return `${d}@s.whatsapp.net`
}

/** JID Baileys (@s.whatsapp.net ou @lid — contatos com privacidade). */
export function isWhatsappJid(value: string): boolean {
  return value.includes("@")
}

export function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid")
}

/** Resolve destino de envio: JID completo ou telefone normalizado. */
export function resolveOutboundJid(input: { remoteJid?: string | null; to?: string | null }): string {
  const jid = input.remoteJid?.trim()
  if (jid && isWhatsappJid(jid)) return jid

  const to = input.to?.trim()
  if (!to) throw new Error("INVALID_PHONE")

  if (isWhatsappJid(to)) return to

  try {
    return phoneToJid(normalizeWhatsappPhone(to))
  } catch {
    if (jid) return jid
    throw new Error("INVALID_PHONE")
  }
}

export function jidToPhoneDigits(jid: string): string {
  const user = jid.split("@")[0]?.split(":")[0] ?? ""
  return user.replace(/\D/g, "")
}
