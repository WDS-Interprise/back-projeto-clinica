import { clinicGreeting } from "@/lib/clinic-time.js"
import { normalizeInboundText } from "@/lib/whatsapp-ai-context.js"

/** Mensagem curta só de cumprimento (oi, olá bom dia, etc.). */
export function looksLikePureGreeting(text: string): boolean {
  const t = normalizeInboundText(text)
  if (!t || t.length > 60) return false
  const stripped = t
    .replace(/\b(bom dia|boa tarde|boa noite|oi|ola|olá|hey|hi|hello|e ai|e aí|tudo bem|td bem)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .trim()
  if (stripped.length > 8) return false
  return /\b(oi|ola|olá|hey|hi|hello|bom dia|boa tarde|boa noite|e ai|e aí|tudo bem|td bem)\b/.test(t)
}

export function buildTimeAwareGreetingReply(hasPatient: boolean): string {
  const hello = clinicGreeting()
  if (hasPatient) {
    return `${hello}! 😊 Como posso ajudar você hoje?`
  }
  return `${hello}! 😊 Para localizar ou criar seu cadastro, me informe seu nome completo ou CPF.`
}
