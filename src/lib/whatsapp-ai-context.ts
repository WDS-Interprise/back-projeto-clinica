export type WhatsappBotMode = "BOT_ACTIVE" | "HUMAN_HANDOFF"

export type BookingState =
  | "IDLE"
  | "BOOKING_IDENTIFY_PATIENT"
  | "BOOKING_SELECT_DOCTOR"
  | "BOOKING_SELECT_DATE"
  | "BOOKING_SELECT_TIME"
  | "BOOKING_AWAITING_CONFIRMATION"
  | "BOOKING_PROCESSING"
  | "BOOKING_CONFIRMED"
  | "BOOKING_RETRY"
  | "BOOKING_AWAITING_RESCHEDULE"
  | "BOOKING_FAILED"

export type ListedDoctor = {
  indice: number
  id: string
  name: string
}

export type PreferredPeriod = "morning" | "afternoon"

export type WhatsappAiContext = {
  mode?: WhatsappBotMode
  pausedAt?: string
  intent?: "BOOK_APPOINTMENT" | "NONE"
  bookingState?: BookingState
  patientId?: string | null
  selectedDoctor?: string | null
  selectedDoctorName?: string | null
  selectedDate?: string | null
  selectedTime?: string | null
  preferredPeriod?: PreferredPeriod | null
  availableSlots?: string[]
  appointmentType?: string | null
  awaitingConfirmation?: boolean
  lastAppointmentId?: string | null
  existingAppointmentId?: string | null
  listedDoctors?: ListedDoctor[]
  lastError?: string | null
  toolFailureCount?: number
  pendingSuggestion?: string
  satisfactionSurveyId?: string | null
  satisfactionSurveySent?: boolean
  awaitingSatisfactionRating?: boolean
}
export const HANDOFF_TIMEOUT_MS = Number(
  process.env.WHATSAPP_AI_HANDOFF_TIMEOUT_MS ?? 30 * 60 * 1000
)

export function parseAiContext(raw: string | null | undefined): WhatsappAiContext {
  if (!raw) return { mode: "BOT_ACTIVE", bookingState: "IDLE" }
  try {
    const parsed = JSON.parse(raw) as WhatsappAiContext
    const bookingState =
      parsed.bookingState ??
      (parsed.awaitingConfirmation
        ? "BOOKING_AWAITING_CONFIRMATION"
        : parsed.intent === "BOOK_APPOINTMENT"
          ? "BOOKING_SELECT_DOCTOR"
          : "IDLE")
    return { mode: "BOT_ACTIVE", ...parsed, bookingState }
  } catch {
    return { mode: "BOT_ACTIVE", bookingState: "IDLE" }
  }
}

export function stringifyAiContext(ctx: WhatsappAiContext): string {
  return JSON.stringify(ctx)
}

export function mergeAiContext(
  current: WhatsappAiContext,
  patch: Partial<WhatsappAiContext>
): WhatsappAiContext {
  const next = { ...current, ...patch }
  if (patch.bookingState === "BOOKING_AWAITING_CONFIRMATION" || patch.awaitingConfirmation === true) {
    next.awaitingConfirmation = true
    next.bookingState = patch.bookingState ?? "BOOKING_AWAITING_CONFIRMATION"
  }
  if (patch.bookingState && patch.bookingState !== "BOOKING_AWAITING_CONFIRMATION") {
    if (patch.awaitingConfirmation === undefined) {
      next.awaitingConfirmation =
        patch.bookingState === "BOOKING_RETRY" || patch.bookingState === "BOOKING_AWAITING_RESCHEDULE"
    }
  }
  return next
}

export function hasCompleteBookingDraft(ctx: WhatsappAiContext): boolean {
  return Boolean(ctx.patientId && ctx.selectedDoctor && ctx.selectedDate && ctx.selectedTime)
}

export function normalizeInboundText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
}

export function looksLikeBookingConfirmation(text: string): boolean {
  const t = normalizeInboundText(text)
  if (!t || t.length > 100) return false
  if (looksLikeBookingDenial(text)) return false
  const collapsed = t.replace(/(.)\1+/g, "$1")
  const variants = [t, collapsed]
  const exact =
    /^(sim|pode|pode sim|sim pode|confirmo|confirmar|fechado|ok|isso|claro|pode ser|esse mesmo|isso mesmo|isso ai|confirma|pode confirmar|pode marcar|marca|marcar|vamos|vamos la|blz|beleza|pode por favor|sim por favor|ok por favor|yes|yeah|yep|sure|okay)$/
  if (variants.some((v) => exact.test(v))) return true
  if (
    variants.some((v) =>
      /\b(pode sim|sim pode|claro que pode|ja falei|ja disse|pode marcar|pode confirmar|confirma sim|marca sim|pode por favor)\b/.test(
        v
      )
    )
  ) {
    return true
  }
  return variants.some((v) => v.length <= 40 && /\b(pode|sim|confir)\b/.test(v) && !/\bnao\b/.test(v))
}

export function looksLikeBookingDenial(text: string): boolean {
  const t = normalizeInboundText(text)
  return /^(nao|não|cancela|cancelar|outro horario|outro horário|agora nao)$/.test(t)
}

export function looksLikeRescheduleConfirmation(text: string): boolean {
  if (looksLikeBookingConfirmation(text)) return true
  const t = normalizeInboundText(text)
  return /\b(remarcar|pode remarcar|quero remarcar|pode trocar|quero trocar|mudar horario|trocar horario)\b/.test(t)
}

export function looksLikeNewBookingRequest(text: string): boolean {
  const t = normalizeInboundText(text)
  return /\b(marcar outra|agendar outra|nova consulta|outro dia|quero marcar|quero agendar)\b/.test(t)
}

export function parseSelectionIndex(text: string): number | null {
  const t = normalizeInboundText(text)
  const exact = t.match(/^(?:opcao|opção|numero|n[uú]mero|o)?\s*([1-9])$/)
  if (exact) return Number(exact[1])
  const want = t.match(/\b(?:quero(?:\s+o|\s+a)?|opcao|opção|numero|n[uú]mero)\s+([1-9])\b/)
  if (want) return Number(want[1])
  const withDoc = t.match(/\b([1-9])\s+com\b/)
  if (withDoc) return Number(withDoc[1])
  return null
}

export function looksLikeDoctorChoice(text: string): boolean {
  const t = normalizeInboundText(text)
  return /\b(quero|doutor|dra?\b|com o|opcao|opção|numero)\b/.test(t) && parseSelectionIndex(text) != null
}

export function parseTimeFromText(text: string): string | null {
  const t = normalizeInboundText(text)
  const hm = t.match(/\b(\d{1,2})[:h.,](\d{2})\b/)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }
  }
  const asHour = t.match(/\b(?:as|a)\s*(\d{1,2})(?:[:h.,](\d{2}))?\b/)
  if (asHour) {
    let h = Number(asHour[1])
    const m = asHour[2] ? Number(asHour[2]) : 0
    if (/\bda tarde\b/.test(t) && h > 0 && h < 12) h += 12
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }
  }
  const hOnly = t.match(/\b(\d{1,2})\s*(?:h|hs|horas?)?\b/)
  const meia = /\be meia\b/.test(t)
  if (hOnly && (/\bh\b|\bhs\b|\bhoras?\b|\bda (tarde|manha|manhã)\b/.test(t) || meia)) {
    let h = Number(hOnly[1])
    if (/\bda tarde\b/.test(t) && h > 0 && h < 12) h += 12
    const m = meia ? 30 : 0
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }
  }
  return null
}

export function parseDateFromText(text: string, todayIso: string): string | null {
  const t = normalizeInboundText(text)
  if (/^hoje$|\bhoje\b/.test(t) && t.length < 40) return todayIso
  if (/\bamanha\b|\bamanhã\b/.test(t) && t.length < 80) {
    const [y, m, d] = todayIso.split("-").map(Number)
    if (y && m && d) {
      const next = new Date(y, m - 1, d + 1)
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
    }
  }
  const diaMes = t.match(/\bdia\s*(\d{1,2})\s*(?:mes|mês)\s*(\d{1,2})\b/)
  if (diaMes) {
    const dd = Number(diaMes[1])
    const mm = Number(diaMes[2])
    const yyyy = Number(todayIso.slice(0, 4))
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
    }
  }
  const br = text.trim().match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/)
  if (br) {
    const dd = Number(br[1])
    const mm = Number(br[2])
    let yyyy = br[3] ? Number(br[3]) : Number(todayIso.slice(0, 4))
    if (yyyy < 100) yyyy += 2000
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
    }
  }
  return null
}

export function extractTimeFromAnyText(text: string): string | null {
  const hm = text.match(/\b(\d{1,2})[:.,](\d{2})\b/)
  if (!hm) return null
  const h = Number(hm[1])
  const m = Number(hm[2])
  if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
  return null
}

export function handoffExpired(ctx: WhatsappAiContext, now = Date.now()): boolean {
  if (ctx.mode !== "HUMAN_HANDOFF" || !ctx.pausedAt) return false
  const at = new Date(ctx.pausedAt).getTime()
  if (Number.isNaN(at)) return true
  return now - at >= HANDOFF_TIMEOUT_MS
}

export function parsePeriodFromText(text: string): PreferredPeriod | null {
  const t = normalizeInboundText(text)
  if (/\b(manha|manhã|pela manha|de manha|inicio da manha|cedo)\b/.test(t)) return "morning"
  if (/\b(tarde|a tarde|à tarde|pela tarde|de tarde|apos.?o almoco|depois do almoco)\b/.test(t)) {
    return "afternoon"
  }
  return null
}

export function looksLikeEnglishAffirmative(text: string): boolean {
  const t = normalizeInboundText(text)
  return /^(yes|yeah|yep|sure|ok|okay)$/.test(t)
}

export function parseTomorrowFromBotOffer(text: string, todayIso: string): string | null {
  if (!/\bamanha\b|\bamanhã\b/.test(text.toLowerCase())) return null
  const [y, m, d] = todayIso.split("-").map(Number)
  if (!y || !m || !d) return null
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
}

export function botOfferedAfternoonStart(text: string): boolean {
  return /\b(a partir das|apos as|depois das|horarios.*tarde|horários.*tarde)\b/i.test(text)
}

export function botAskedPeriodChoice(text: string): boolean {
  return /\b(manha|manhã).*(tarde)|\b(tarde).*(manha|manhã)/i.test(text)
}

export function botOfferedTomorrow(text: string): boolean {
  return /\bdeseja agendar para amanha\b|\bdeseja agendar para amanhã\b|\bagendar para amanha\b/i.test(
    text
  )
}

export function filterSlotsByPeriod(slots: string[], period: PreferredPeriod | null | undefined): string[] {
  if (!period) return slots
  if (period === "morning") return slots.filter((t) => {
    const m = t.match(/^(\d{1,2}):/)
    if (!m) return true
    return Number(m[1]) < 12
  })
  return slots.filter((t) => {
    const m = t.match(/^(\d{1,2}):/)
    if (!m) return true
    return Number(m[1]) >= 12
  })
}

export function nearestSlots(requested: string, slots: string[], limit = 2): string[] {
  if (slots.length === 0) return []
  const target = (() => {
    const m = requested.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  })()
  if (target == null) return slots.slice(0, limit)
  return [...slots]
    .sort((a, b) => {
      const ma = a.match(/^(\d{1,2}):(\d{2})$/)
      const mb = b.match(/^(\d{1,2}):(\d{2})$/)
      const ta = ma ? Number(ma[1]) * 60 + Number(ma[2]) : 0
      const tb = mb ? Number(mb[1]) * 60 + Number(mb[2]) : 0
      return Math.abs(ta - target) - Math.abs(tb - target)
    })
    .slice(0, limit)
}

export function formatContextForPrompt(ctx: WhatsappAiContext): string {
  if (ctx.intent !== "BOOK_APPOINTMENT" && ctx.bookingState === "IDLE" && !ctx.awaitingConfirmation) {
    return ""
  }
  const listed =
    ctx.listedDoctors?.map((d) => `${d.indice}:${d.id}:${d.name}`).join(", ") ?? ""
  return [
    "[BLOCO INTERNO. NUNCA copie, cole ou parafraseie isto na mensagem ao paciente.]",
    "Use só para chamar ferramentas com os ids corretos.",
    `bookingState=${ctx.bookingState ?? "IDLE"}`,
    `intent=${ctx.intent ?? "NONE"}`,
    `patientId=${ctx.patientId ?? ""}`,
    `selectedDoctor=${ctx.selectedDoctor ?? ""}`,
    `selectedDoctorName=${ctx.selectedDoctorName ?? ""}`,
    `selectedDate=${ctx.selectedDate ?? ""}`,
    `selectedTime=${ctx.selectedTime ?? ""}`,
    ctx.preferredPeriod ? `preferredPeriod=${ctx.preferredPeriod}` : "",
    ctx.availableSlots?.length ? `availableSlots=${ctx.availableSlots.join(",")}` : "",
    ctx.toolFailureCount ? `toolFailureCount=${ctx.toolFailureCount}` : "",
    `awaitingConfirmation=${ctx.awaitingConfirmation ? "true" : "false"}`,
    `lastAppointmentId=${ctx.lastAppointmentId ?? ""}`,
    `existingAppointmentId=${ctx.existingAppointmentId ?? ""}`,
    listed ? `listedDoctors=${listed}` : "",
    ctx.selectedDoctor
      ? "Médico já escolhido por ID. NÃO busque de novo por nome (Dr. Jr etc.). Use selectedDoctor."
      : "",
    ctx.bookingState === "BOOKING_AWAITING_CONFIRMATION" ||
    ctx.bookingState === "BOOKING_RETRY" ||
    ctx.bookingState === "BOOKING_AWAITING_RESCHEDULE"
      ? "Há proposta pendente no orquestrador. Se o paciente só confirmar, o backend agenda sem você."
      : "",
    ctx.toolFailureCount && ctx.toolFailureCount >= 2
      ? "Agenda indisponível após falhas. Não invente horários. Encaminhe a um atendente."
      : "",
    "Antes de perguntar data, período ou horário, verifique se já estão no estado acima. Não repita perguntas já respondidas.",
    "Se ferramenta falhar: diga uma vez que não conseguiu consultar a agenda. Nunca diga que está resolvendo ou normalizando.",
  ]
    .filter(Boolean)
    .join("\n")
}

export function stripInternalContextLeak(text: string): string {
  const lines = text.split(/\r?\n/)
  const cleaned = lines.filter((line) => {
    const t = line.trim()
    if (!t) return true
    if (/BLOCO INTERNO|Estado operacional|fonte da ClinMax/i.test(t)) return false
    if (
      /^(intent|patientId|selectedDoctor|selectedDoctorName|selectedDate|selectedTime|awaitingConfirmation|bookingState|listedDoctors|lastAppointmentId|existingAppointmentId)\s*=/i.test(
        t
      )
    ) {
      return false
    }
    if (/não invente ids|nao invente ids/i.test(t)) return false
    return true
  })
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
