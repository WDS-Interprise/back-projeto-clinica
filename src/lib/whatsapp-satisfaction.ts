import { systemAuthContext } from "@/lib/ai-system-context.js"
import { normalizeInboundText } from "@/lib/whatsapp-ai-context.js"
import * as satisfactionService from "@/services/satisfaction.service.js"

export function looksLikeThanks(text: string): boolean {
  const t = normalizeInboundText(text)
  if (!t || t.length > 80) return false
  return /\b(obrigad[oa]|brigad[oa]|valeu|agradeço|agradeco|thanks|thank you|thx)\b/.test(t)
}

export function parseSatisfactionRating(text: string): number | null {
  const t = normalizeInboundText(text)
  const exact = t.match(/^([1-5])(?:\s*(?:estrelas?|pts?|pontos?|de\s*5))?$/)
  if (exact) return Number(exact[1])
  const embedded = t.match(/\b(?:nota|avaliacao|avaliação)\s*([1-5])\b/)
  if (embedded) return Number(embedded[1])
  if (/^[1-5]$/.test(t)) return Number(t)
  return null
}

export async function createSurveyForAppointment(params: {
  clinicId: string
  appointmentId: string
  patientId?: string | null
}) {
  const auth = systemAuthContext(params.clinicId)
  const survey = await satisfactionService.createSurvey(auth, {
    appointmentId: params.appointmentId,
    patientId: params.patientId ?? undefined,
  })
  return survey.id
}

export async function markSurveySent(clinicId: string, surveyId: string) {
  const auth = systemAuthContext(clinicId)
  await satisfactionService.markSent(auth, surveyId)
}

export async function saveSurveyRating(params: {
  clinicId: string
  surveyId: string
  rating: number
  comment?: string
}) {
  const auth = systemAuthContext(params.clinicId)
  await satisfactionService.submitAnswer(auth, params.surveyId, {
    rating: params.rating,
    comment: params.comment,
  })
}
