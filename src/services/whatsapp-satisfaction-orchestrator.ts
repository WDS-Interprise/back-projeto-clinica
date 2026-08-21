import prisma from "@/lib/prisma.js"
import {
  mergeAiContext,
  parseAiContext,
  stringifyAiContext,
  type WhatsappAiContext,
} from "@/lib/whatsapp-ai-context.js"
import {
  createSurveyForAppointment,
  looksLikeThanks,
  markSurveySent,
  parseSatisfactionRating,
  saveSurveyRating,
} from "@/lib/whatsapp-satisfaction.js"

type Params = {
  clinicId: string
  chatId: string
  inboundText: string
}

async function loadCtx(chatId: string): Promise<WhatsappAiContext> {
  const chat = await prisma.whatsappChat.findUnique({
    where: { id: chatId },
    select: { aiContextJson: true },
  })
  return parseAiContext(chat?.aiContextJson)
}

async function saveCtx(chatId: string, patch: Partial<WhatsappAiContext>) {
  const current = await loadCtx(chatId)
  const next = mergeAiContext(current, patch)
  await prisma.whatsappChat.update({
    where: { id: chatId },
    data: { aiContextJson: stringifyAiContext(next) },
  })
  return next
}

async function ensureSurveyId(
  params: Params,
  ctx: WhatsappAiContext
): Promise<string | null> {
  if (ctx.satisfactionSurveyId) return ctx.satisfactionSurveyId
  const appointmentId = ctx.lastAppointmentId ?? ctx.existingAppointmentId
  if (!appointmentId) return null
  try {
    const id = await createSurveyForAppointment({
      clinicId: params.clinicId,
      appointmentId,
      patientId: ctx.patientId,
    })
    await saveCtx(params.chatId, { satisfactionSurveyId: id })
    return id
  } catch (err) {
    console.error("[WhatsApp satisfaction] falha ao criar pesquisa", err)
    return null
  }
}

/**
 * Fluxo determinístico: obrigado → pergunta 1-5 → grava na pesquisa da clínica.
 */
export async function tryDeterministicSatisfaction(params: Params): Promise<string | null> {
  let ctx = await loadCtx(params.chatId)
  const text = params.inboundText.trim()
  if (!text) return null

  if (ctx.awaitingSatisfactionRating && ctx.satisfactionSurveyId) {
    const rating = parseSatisfactionRating(text)
    if (rating != null) {
      try {
        await saveSurveyRating({
          clinicId: params.clinicId,
          surveyId: ctx.satisfactionSurveyId,
          rating,
        })
      } catch (err) {
        console.error("[WhatsApp satisfaction] falha ao salvar nota", err)
        return "Não consegui registrar sua avaliação agora. Pode tentar de novo enviando um número de 1 a 5?"
      }
      await saveCtx(params.chatId, {
        awaitingSatisfactionRating: false,
        satisfactionSurveySent: true,
        satisfactionSurveyId: null,
        intent: "NONE",
        bookingState: "IDLE",
      })
      return `Obrigado pela avaliação! Sua nota ${rating} foi registrada. 😊`
    }
    return "Para avaliar, envie um número de 1 a 5 (1 = ruim, 5 = excelente)."
  }

  if (
    ctx.satisfactionSurveyId &&
    !ctx.satisfactionSurveySent &&
    parseSatisfactionRating(text) != null
  ) {
    const rating = parseSatisfactionRating(text)!
    try {
      await markSurveySent(params.clinicId, ctx.satisfactionSurveyId)
      await saveSurveyRating({
        clinicId: params.clinicId,
        surveyId: ctx.satisfactionSurveyId,
        rating,
      })
    } catch (err) {
      console.error("[WhatsApp satisfaction] falha ao salvar nota direta", err)
      return "Não consegui registrar sua avaliação agora. Pode tentar de novo enviando um número de 1 a 5?"
    }
    await saveCtx(params.chatId, {
      awaitingSatisfactionRating: false,
      satisfactionSurveySent: true,
      satisfactionSurveyId: null,
      intent: "NONE",
      bookingState: "IDLE",
    })
    return `Obrigado pela avaliação! Sua nota ${rating} foi registrada. 😊`
  }

  const afterBooking =
    ctx.bookingState === "BOOKING_CONFIRMED" ||
    Boolean(ctx.lastAppointmentId && ctx.satisfactionSurveyId)

  if (!afterBooking && !ctx.satisfactionSurveyId) return null

  if (!looksLikeThanks(text)) return null

  const surveyId = await ensureSurveyId(params, ctx)
  if (!surveyId) {
    return "Por nada! 😊 Se precisar de algo mais, estou à disposição."
  }

  if (ctx.satisfactionSurveySent && !ctx.awaitingSatisfactionRating) {
    return "Por nada! 😊 Se precisar de algo mais, estou à disposição."
  }

  try {
    await markSurveySent(params.clinicId, surveyId)
  } catch (err) {
    console.error("[WhatsApp satisfaction] falha ao marcar enviada", err)
  }

  await saveCtx(params.chatId, {
    satisfactionSurveyId: surveyId,
    satisfactionSurveySent: true,
    awaitingSatisfactionRating: true,
  })

  return "Por nada! 😊 De 1 a 5, como você avalia nosso atendimento? (1 = ruim, 5 = excelente)"
}

/** Chamar após agendamento confirmado para preparar pesquisa. */
export async function attachSurveyToConfirmedBooking(params: {
  clinicId: string
  chatId: string
  appointmentId: string
  patientId?: string | null
}) {
  try {
    const existing = await prisma.satisfactionSurvey.findFirst({
      where: {
        clinicId: params.clinicId,
        appointmentId: params.appointmentId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    const surveyId =
      existing?.id ??
      (await createSurveyForAppointment({
        clinicId: params.clinicId,
        appointmentId: params.appointmentId,
        patientId: params.patientId,
      }))
    await saveCtx(params.chatId, {
      satisfactionSurveyId: surveyId,
      satisfactionSurveySent: false,
      awaitingSatisfactionRating: false,
      bookingState: "BOOKING_CONFIRMED",
    })
  } catch (err) {
    console.error("[WhatsApp satisfaction] attachSurveyToConfirmedBooking", err)
  }
}
