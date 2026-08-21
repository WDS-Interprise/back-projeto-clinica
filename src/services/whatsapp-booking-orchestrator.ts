import prisma from "@/lib/prisma.js"
import { clinicTodayIso } from "@/lib/clinic-time.js"
import {
  botOfferedAfternoonStart,
  botOfferedTomorrow,
  botAskedPeriodChoice,
  extractTimeFromAnyText,
  filterSlotsByPeriod,
  hasCompleteBookingDraft,
  looksLikeBookingConfirmation,
  looksLikeBookingDenial,
  looksLikeDoctorChoice,
  looksLikeNewBookingRequest,
  looksLikeRescheduleConfirmation,
  mergeAiContext,
  nearestSlots,
  parseAiContext,
  parseDateFromText,
  parsePeriodFromText,
  parseSelectionIndex,
  parseTimeFromText,
  parseTomorrowFromBotOffer,
  stringifyAiContext,
  type PreferredPeriod,
  type WhatsappAiContext,
} from "@/lib/whatsapp-ai-context.js"
import { executeAiTool, type AiToolContext } from "@/services/whatsapp-ai-tools.service.js"
import { resolveClinicDoctor } from "@/lib/whatsapp-doctor-resolve.js"

const MAX_TOOL_FAILURES = 2

type OrchestratorParams = {
  clinicId: string
  connectionId: string
  chatId: string
  phoneDigits: string
  patientId: string | null
  inboundText: string
}

function todayIso() {
  return clinicTodayIso()
}

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function dateLabel(iso: string) {
  return iso === todayIso() ? "hoje" : formatDateBr(iso)
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

function toolCtx(params: OrchestratorParams): AiToolContext {
  return {
    clinicId: params.clinicId,
    connectionId: params.connectionId,
    chatId: params.chatId,
    phoneDigits: params.phoneDigits,
    patientId: params.patientId,
  }
}

async function lastAssistantText(chatId: string): Promise<string> {
  const row = await prisma.whatsappMessage.findFirst({
    where: { chatId, fromMe: true },
    orderBy: { sentAt: "desc" },
    select: { content: true },
  })
  return row?.content ?? ""
}

async function recoverDraft(
  params: OrchestratorParams,
  ctx: WhatsappAiContext
): Promise<WhatsappAiContext> {
  let next = { ...ctx }
  if (!next.patientId && params.patientId) next.patientId = params.patientId

  const lastBot = await lastAssistantText(params.chatId)
  if (!next.selectedTime) {
    next.selectedTime = extractTimeFromAnyText(lastBot) ?? parseTimeFromText(lastBot)
  }
  if (!next.selectedDate) {
    next.selectedDate = parseDateFromText(lastBot, todayIso())
  }

  const resolved = await resolveClinicDoctor({
    clinicId: params.clinicId,
    doctorId: next.selectedDoctor,
    nameHint: next.selectedDoctorName || lastBot,
    listedDoctors: next.listedDoctors,
  })
  if (resolved) {
    next.selectedDoctor = resolved.id
    next.selectedDoctorName = resolved.name
  } else if (!next.selectedDoctor) {
    const listed = next.listedDoctors ?? []
    const byList = listed.find((d) => lastBot.toLowerCase().includes(d.name.toLowerCase()))
    if (byList) {
      next.selectedDoctor = byList.id
      next.selectedDoctorName = byList.name
    }
  }

  if (hasCompleteBookingDraft(next)) {
    const keepState =
      ctx.bookingState === "BOOKING_AWAITING_RESCHEDULE" || ctx.bookingState === "BOOKING_RETRY"
        ? ctx.bookingState
        : "BOOKING_AWAITING_CONFIRMATION"
    next = await saveCtx(params.chatId, {
      intent: "BOOK_APPOINTMENT",
      patientId: next.patientId,
      selectedDoctor: next.selectedDoctor,
      selectedDoctorName: next.selectedDoctorName,
      selectedDate: next.selectedDate,
      selectedTime: next.selectedTime,
      bookingState: keepState,
      awaitingConfirmation: true,
    })
  }
  return next
}

function alreadyBookedReply(ctx: WhatsappAiContext) {
  const name = ctx.selectedDoctorName || "o profissional escolhido"
  const when = ctx.selectedDate ? dateLabel(ctx.selectedDate) : "a data combinada"
  const time = ctx.selectedTime || "o horário combinado"
  return `Sua consulta com ${name} para ${when} às ${time} já está confirmada.`
}

function pendingPrompt(ctx: WhatsappAiContext) {
  const name = ctx.selectedDoctorName || "o profissional escolhido"
  const when = ctx.selectedDate ? dateLabel(ctx.selectedDate) : "a data combinada"
  const time = ctx.selectedTime || "o horário combinado"
  return `A consulta preparada é com ${name} ${when} às ${time}. Para confirmar, responda "sim".`
}

function retryPrompt(ctx: WhatsappAiContext) {
  const time = ctx.selectedTime || "esse horário"
  return `Não consegui concluir o agendamento das ${time} agora. Posso tentar novamente no mesmo horário?`
}

function existingAppointmentPrompt(params: {
  existingTime: string
  existingDoctor: string
  when: string
  newTime?: string | null
  newDoctor?: string | null
  slotFree: boolean
  proximos?: string[]
}) {
  const atual = `Olha, você já tem um horário marcado ${params.when} às ${params.existingTime} com ${params.existingDoctor}.`
  if (params.slotFree && params.newTime) {
    const novoMedico =
      params.newDoctor && params.newDoctor !== params.existingDoctor
        ? ` com ${params.newDoctor}`
        : ""
    return `${atual} Deseja remarcar para ${params.newTime}${novoMedico}?`
  }
  const proximos = params.proximos ?? []
  if (proximos.length > 0) {
    return `${atual} O horário das ${params.newTime ?? "escolhido"} não está livre. Tenho ${proximos.join(", ")}. Qual prefere para remarcar?`
  }
  return `${atual} Deseja remarcar para outro horário?`
}

async function executePendingBooking(
  params: OrchestratorParams,
  ctx: WhatsappAiContext
): Promise<string> {
  const resolved = await resolveClinicDoctor({
    clinicId: params.clinicId,
    doctorId: ctx.selectedDoctor,
    nameHint: ctx.selectedDoctorName,
    listedDoctors: ctx.listedDoctors,
  })
  if (resolved) {
    ctx = await saveCtx(params.chatId, {
      selectedDoctor: resolved.id,
      selectedDoctorName: resolved.name,
    })
  } else {
    console.error("[WhatsApp booking] médico inválido", ctx.selectedDoctor, ctx.selectedDoctorName)
    await saveCtx(params.chatId, {
      bookingState: "BOOKING_SELECT_DOCTOR",
      awaitingConfirmation: false,
      selectedDoctor: null,
      selectedDoctorName: null,
    })
    return "Não localizei o profissional na agenda. Qual deles você prefere? Responda com o número da lista."
  }

  const remarcar = ctx.bookingState === "BOOKING_AWAITING_RESCHEDULE"
  await saveCtx(params.chatId, { bookingState: "BOOKING_PROCESSING" })
  const raw = await executeAiTool(
    "agendar_consulta",
    {
      confirmacao: true,
      remarcar,
      appointmentId: ctx.existingAppointmentId,
      doctorId: resolved.id,
      date: ctx.selectedDate,
      startTime: ctx.selectedTime,
      patientId: ctx.patientId,
    },
    toolCtx(params)
  )

  let parsed: {
    sucesso?: boolean
    remarcada?: boolean
    horarioOcupou?: boolean
    jaTemConsulta?: boolean
    aguardandoRemarcacao?: boolean
    horariosProximos?: string[]
    consultaExistente?: { horario?: string; medico?: string; id?: string }
    erro?: string
    medico?: string
    dataBr?: string
    horario?: string
    consultaHoje?: boolean
    idempotente?: boolean
  }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    parsed = { sucesso: false, erro: "Falha ao ler resultado do agendamento" }
  }

  if (!parsed.sucesso) {
    console.error("[WhatsApp booking] agendar_consulta falhou", parsed.erro, {
      doctorId: resolved.id,
      date: ctx.selectedDate,
      time: ctx.selectedTime,
    })
  }

  if (parsed.sucesso) {
    const name = parsed.medico || ctx.selectedDoctorName || "o profissional"
    const time = parsed.horario || ctx.selectedTime
    const verb = parsed.remarcada ? "remarcada" : "confirmada"
    if (parsed.consultaHoje || ctx.selectedDate === todayIso()) {
      return `Consulta ${verb} com ${name} hoje às ${time}. 😊`
    }
    return `Consulta ${verb} com ${name} em ${parsed.dataBr ?? formatDateBr(ctx.selectedDate ?? "")} às ${time}. 😊`
  }

  if (parsed.jaTemConsulta && parsed.consultaExistente) {
    const proximos = parsed.horariosProximos ?? []
    await saveCtx(params.chatId, {
      bookingState: parsed.aguardandoRemarcacao ? "BOOKING_AWAITING_RESCHEDULE" : "BOOKING_SELECT_TIME",
      awaitingConfirmation: Boolean(parsed.aguardandoRemarcacao),
      selectedTime: parsed.aguardandoRemarcacao ? ctx.selectedTime : null,
      existingAppointmentId: parsed.consultaExistente.id ?? ctx.existingAppointmentId,
    })
    return existingAppointmentPrompt({
      existingTime: parsed.consultaExistente.horario || "",
      existingDoctor: parsed.consultaExistente.medico || "o profissional",
      when: ctx.selectedDate ? dateLabel(ctx.selectedDate) : "neste dia",
      newTime: ctx.selectedTime,
      newDoctor: parsed.medico || ctx.selectedDoctorName,
      slotFree: Boolean(parsed.aguardandoRemarcacao),
      proximos,
    })
  }

  if (parsed.horarioOcupou) {
    const proximos = parsed.horariosProximos ?? []
    await saveCtx(params.chatId, {
      bookingState: "BOOKING_SELECT_TIME",
      awaitingConfirmation: false,
      selectedTime: null,
    })
    if (proximos.length > 0) {
      return `O horário das ${ctx.selectedTime} acabou de ficar indisponível. Tenho ${proximos.join(", ")}; qual prefere?`
    }
    return `O horário das ${ctx.selectedTime} acabou de ficar indisponível. Qual outro horário você prefere?`
  }

  await saveCtx(params.chatId, {
    bookingState: "BOOKING_RETRY",
    awaitingConfirmation: true,
    lastError: parsed.erro ?? "falha temporária",
  })
  return retryPrompt(ctx)
}

async function selectDoctorByIndex(params: OrchestratorParams, ctx: WhatsappAiContext, indice: number) {
  const listed = ctx.listedDoctors ?? []
  const picked = listed.find((d) => d.indice === indice)
  if (!picked) return null
  const resolved = await resolveClinicDoctor({
    clinicId: params.clinicId,
    doctorId: picked.id,
    nameHint: picked.name,
    listedDoctors: listed,
  })
  if (!resolved) return null
  const next = await saveCtx(params.chatId, {
    intent: "BOOK_APPOINTMENT",
    bookingState: ctx.selectedDate ? "BOOKING_SELECT_TIME" : "BOOKING_SELECT_DATE",
    selectedDoctor: resolved.id,
    selectedDoctorName: resolved.name,
  })
  return next
}

function periodLabel(period: PreferredPeriod) {
  return period === "morning" ? "pela manhã" : "à tarde"
}

async function handoffAfterFailures(chatId: string, ctx: WhatsappAiContext): Promise<string> {
  await prisma.whatsappChat.update({
    where: { id: chatId },
    data: {
      aiPaused: true,
      aiContextJson: stringifyAiContext({
        ...ctx,
        mode: "HUMAN_HANDOFF",
        pausedAt: new Date().toISOString(),
        bookingState: "BOOKING_FAILED",
        lastError: "agenda_indisponivel",
      }),
    },
  })
  return "Não consegui acessar a agenda agora. Registrei seu pedido para a equipe continuar o atendimento."
}

async function bumpToolFailure(chatId: string, ctx: WhatsappAiContext): Promise<WhatsappAiContext> {
  const count = (ctx.toolFailureCount ?? 0) + 1
  return saveCtx(chatId, { toolFailureCount: count, lastError: "falha_consulta_agenda" })
}

type SlotsFetchResult =
  | { ok: true; slots: string[]; ctx: WhatsappAiContext }
  | { ok: false; reply: string }

async function fetchSlotsForContext(
  params: OrchestratorParams,
  ctx: WhatsappAiContext,
  opts?: { period?: PreferredPeriod | null; date?: string }
): Promise<SlotsFetchResult> {
  const date = opts?.date ?? ctx.selectedDate
  if (!date || !ctx.selectedDoctor) {
    return { ok: false, reply: "Preciso da data e do profissional para consultar a agenda." }
  }

  const raw = await executeAiTool(
    "buscar_horarios",
    { doctorId: ctx.selectedDoctor, date },
    toolCtx(params)
  )
  let parsed: {
    erro?: string
    horariosParaOferecer?: Array<{ inicio: string } | string>
    horarios?: Array<{ inicio: string }>
    consultasDoPacienteNoDia?: Array<{ horario: string; medico: string; id?: string }>
    totalLivres?: number
  }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    parsed = { erro: "resposta inválida" }
  }

  if (parsed.erro) {
    const failed = await bumpToolFailure(params.chatId, ctx)
    if ((failed.toolFailureCount ?? 0) >= MAX_TOOL_FAILURES) {
      return { ok: false, reply: await handoffAfterFailures(params.chatId, failed) }
    }
    return {
      ok: false,
      reply: "Não consegui consultar a agenda agora. Pode tentar de novo em instantes?",
    }
  }

  const period = opts?.period ?? ctx.preferredPeriod ?? null
  const allSlots = (parsed.horarios ?? parsed.horariosParaOferecer ?? []).map((h) =>
    typeof h === "string" ? h : h.inicio
  )
  let slots = filterSlotsByPeriod(allSlots, period)
  if (slots.length === 0 && allSlots.length > 0 && period) {
    slots = allSlots
  }

  const next = await saveCtx(params.chatId, {
    intent: "BOOK_APPOINTMENT",
    selectedDate: date,
    selectedTime: null,
    preferredPeriod: period ?? ctx.preferredPeriod ?? null,
    availableSlots: slots,
    bookingState: "BOOKING_SELECT_TIME",
    awaitingConfirmation: false,
    toolFailureCount: 0,
    lastError: null,
  })

  const atual = parsed.consultasDoPacienteNoDia?.[0]
  if (atual) {
    await saveCtx(params.chatId, { existingAppointmentId: atual.id ?? ctx.existingAppointmentId })
    const opcoes = slots.length > 0 ? ` Tenho ${slots.slice(0, 6).join(", ")}.` : ""
    return {
      ok: false,
      reply: `Você já tem consulta ${dateLabel(date)} às ${atual.horario} com ${atual.medico}.${opcoes} Deseja remarcar?`,
    }
  }

  if (slots.length === 0) {
    if (date === todayIso()) {
      const tomorrow = parseTomorrowFromBotOffer("amanhã", todayIso())!
      return {
        ok: false,
        reply: `Não há mais horários livres hoje. Deseja agendar para amanhã (${formatDateBr(tomorrow)})?`,
      }
    }
    return {
      ok: false,
      reply: `Não há horários livres ${dateLabel(date)} com ${ctx.selectedDoctorName}. Qual outra data você prefere?`,
    }
  }

  return { ok: true, slots, ctx: next }
}

function formatSlotsOffer(
  ctx: WhatsappAiContext,
  slots: string[],
  period?: PreferredPeriod | null
) {
  const name = ctx.selectedDoctorName || "o profissional"
  const when = ctx.selectedDate ? dateLabel(ctx.selectedDate) : "no dia escolhido"
  const periodText = period ? ` ${periodLabel(period)}` : ""
  const list = slots.slice(0, 6).join(", ")
  return `Para ${when}${periodText}, ${name} tem ${list}. Qual fica melhor para você?`
}

async function ensureDoctorSelected(
  params: OrchestratorParams,
  ctx: WhatsappAiContext
): Promise<WhatsappAiContext> {
  if (ctx.selectedDoctor) return ctx
  const listed = ctx.listedDoctors ?? []
  if (listed.length !== 1) return ctx
  return saveCtx(params.chatId, {
    intent: "BOOK_APPOINTMENT",
    selectedDoctor: listed[0].id,
    selectedDoctorName: listed[0].name,
    bookingState: ctx.selectedDate ? "BOOKING_SELECT_TIME" : "BOOKING_SELECT_DATE",
  })
}

async function lockTimeAndAskConfirm(
  params: OrchestratorParams,
  ctx: WhatsappAiContext,
  time: string
): Promise<string | null> {
  if (!ctx.selectedDate) return null
  const resolved = await resolveClinicDoctor({
    clinicId: params.clinicId,
    doctorId: ctx.selectedDoctor,
    nameHint: ctx.selectedDoctorName,
    listedDoctors: ctx.listedDoctors,
  })
  if (!resolved) return null
  ctx = await saveCtx(params.chatId, {
    selectedDoctor: resolved.id,
    selectedDoctorName: resolved.name,
  })
  const raw = await executeAiTool(
    "verificar_horario",
    { doctorId: resolved.id, date: ctx.selectedDate, startTime: time },
    toolCtx(params)
  )
  let parsed: {
    disponivel?: boolean
    jaTemConsulta?: boolean
    jaConfirmada?: boolean
    inicio?: string | null
    horariosProximos?: Array<{ inicio: string } | string>
    consultaExistente?: { horario?: string; medico?: string }
  }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return null
  }
  if (!ctx.selectedDate) return null
  const name = ctx.selectedDoctorName || "o profissional"
  const when = dateLabel(ctx.selectedDate)
  const proximos = (parsed.horariosProximos ?? []).map((h) =>
    typeof h === "string" ? h : h.inicio
  )

  if (parsed.jaConfirmada) {
    return `Sua consulta com ${parsed.consultaExistente?.medico || name} ${when} às ${parsed.consultaExistente?.horario || time} já está confirmada.`
  }

  if (parsed.jaTemConsulta && parsed.consultaExistente) {
    return existingAppointmentPrompt({
      existingTime: parsed.consultaExistente.horario || "",
      existingDoctor: parsed.consultaExistente.medico || "o profissional",
      when,
      newTime: time,
      newDoctor: name,
      slotFree: Boolean(parsed.disponivel),
      proximos,
    })
  }

  if (parsed.disponivel) {
    await saveCtx(params.chatId, {
      selectedTime: parsed.inicio ?? time,
      awaitingConfirmation: true,
      bookingState: "BOOKING_AWAITING_CONFIRMATION",
    })
    return `Posso confirmar sua consulta com ${name} ${when} às ${parsed.inicio ?? time}?`
  }
  if (proximos.length > 0) {
    await saveCtx(params.chatId, {
      availableSlots: proximos,
      selectedTime: null,
      bookingState: "BOOKING_SELECT_TIME",
      awaitingConfirmation: false,
    })
    return `${time} não está disponível. Os horários mais próximos são ${proximos.join(" e ")}. Qual prefere?`
  }
  return "Esse horário não está livre. Qual outro horário você prefere?"
}

/**
 * Ações determinísticas ANTES do 9Router.
 * Se retornar string, envie ao paciente e não chame a IA.
 */
export async function tryDeterministicBooking(params: OrchestratorParams): Promise<string | null> {
  let ctx = await loadCtx(params.chatId)
  const text = params.inboundText.trim()
  if (!text) return null

  if ((ctx.toolFailureCount ?? 0) >= MAX_TOOL_FAILURES && ctx.bookingState !== "BOOKING_CONFIRMED") {
    return handoffAfterFailures(params.chatId, ctx)
  }

  if (params.patientId && params.patientId !== ctx.patientId) {
    ctx = await saveCtx(params.chatId, { patientId: params.patientId })
  }

  const state = ctx.bookingState ?? "IDLE"
  const lastBot = await lastAssistantText(params.chatId)
  const affirmative =
    looksLikeBookingConfirmation(text) && !looksLikeNewBookingRequest(text)

  if (state === "BOOKING_CONFIRMED" && affirmative) {
    return alreadyBookedReply(ctx)
  }

  if (state === "BOOKING_CONFIRMED" && looksLikeNewBookingRequest(text)) {
    await saveCtx(params.chatId, {
      intent: "BOOK_APPOINTMENT",
      bookingState: "BOOKING_SELECT_DOCTOR",
      selectedDoctor: null,
      selectedDoctorName: null,
      selectedDate: null,
      selectedTime: null,
      awaitingConfirmation: false,
      lastAppointmentId: ctx.lastAppointmentId,
    })
    return null
  }

  const confirmationStates =
    state === "BOOKING_AWAITING_CONFIRMATION" ||
    state === "BOOKING_RETRY" ||
    state === "BOOKING_AWAITING_RESCHEDULE" ||
    ctx.awaitingConfirmation

  if (confirmationStates && looksLikeBookingDenial(text)) {
    const keepExisting = Boolean(ctx.existingAppointmentId) && state === "BOOKING_AWAITING_RESCHEDULE"
    await saveCtx(params.chatId, {
      bookingState: keepExisting ? "BOOKING_CONFIRMED" : "BOOKING_SELECT_TIME",
      awaitingConfirmation: false,
      selectedTime: keepExisting ? ctx.selectedTime : null,
    })
    return keepExisting
      ? "Sem problema. Mantive o horário que você já tinha marcado."
      : "Sem problema. Qual horário você prefere?"
  }

  if (confirmationStates && parseSelectionIndex(text) != null && !looksLikeDoctorChoice(text)) {
    return pendingPrompt(ctx)
  }

  if (
    confirmationStates &&
    (state === "BOOKING_AWAITING_RESCHEDULE"
      ? looksLikeRescheduleConfirmation(text)
      : looksLikeBookingConfirmation(text))
  ) {
    ctx = await recoverDraft(params, ctx)
    if (hasCompleteBookingDraft(ctx)) {
      console.log(
        "[WhatsApp booking] confirmação determinística",
        params.chatId,
        ctx.selectedDoctor,
        ctx.selectedDate,
        ctx.selectedTime
      )
      return executePendingBooking(params, ctx)
    }
    await saveCtx(params.chatId, { bookingState: "BOOKING_SELECT_DOCTOR", awaitingConfirmation: false })
    return "Não consegui recuperar os dados da consulta. Com qual profissional você quer agendar?"
  }

  const indice = parseSelectionIndex(text)
  if (indice != null && (state === "BOOKING_SELECT_DOCTOR" || looksLikeDoctorChoice(text))) {
    const next = await selectDoctorByIndex(params, ctx, indice)
    if (next?.selectedDoctorName) {
      return `Certo, ${next.selectedDoctorName}. Para qual dia você prefere? (ex.: hoje, amanhã ou 20/08)`
    }
  }

  ctx = await ensureDoctorSelected(params, ctx)

  const bookingDateStates =
    state === "BOOKING_SELECT_DATE" ||
    state === "BOOKING_SELECT_TIME" ||
    state === "BOOKING_SELECT_DOCTOR"

  if (bookingDateStates && ctx.selectedDoctor) {
    const date = parseDateFromText(text, todayIso())
    const time = parseTimeFromText(text)
    if (date && time) {
      ctx = await saveCtx(params.chatId, {
        selectedDate: date,
        selectedTime: time,
        bookingState: "BOOKING_SELECT_TIME",
        intent: "BOOK_APPOINTMENT",
        awaitingConfirmation: false,
      })
      const reply = await lockTimeAndAskConfirm(params, ctx, time)
      if (reply) return reply
    }
  }

  if (
    (state === "BOOKING_SELECT_DATE" || state === "BOOKING_SELECT_TIME" || state === "BOOKING_SELECT_DOCTOR") &&
    ctx.selectedDoctor
  ) {
    const date = parseDateFromText(text, todayIso())
    if (date && (state === "BOOKING_SELECT_DATE" || state === "BOOKING_SELECT_DOCTOR")) {
      ctx = await saveCtx(params.chatId, {
        selectedDate: date,
        selectedTime: null,
        preferredPeriod: null,
        availableSlots: [],
        bookingState: "BOOKING_SELECT_TIME",
        intent: "BOOK_APPOINTMENT",
        awaitingConfirmation: false,
      })
      const fetched = await fetchSlotsForContext(params, ctx, { date })
      if (!fetched.ok) return fetched.reply
      return formatSlotsOffer(fetched.ctx, fetched.slots)
    }
  }

  if (
    state === "BOOKING_SELECT_TIME" &&
    ctx.selectedDoctor &&
    ctx.selectedDate &&
    !ctx.awaitingConfirmation
  ) {
    const period = parsePeriodFromText(text)
    if (period) {
      let patch: Partial<WhatsappAiContext> = { preferredPeriod: period }
      if (botOfferedTomorrow(lastBot) || /\bamanha\b|\bamanhã\b/.test(lastBot.toLowerCase())) {
        const tomorrow = parseTomorrowFromBotOffer("amanhã", todayIso())
        if (tomorrow) patch = { ...patch, selectedDate: tomorrow }
      }
      ctx = await saveCtx(params.chatId, patch)
      const fetched = await fetchSlotsForContext(params, ctx, { period })
      if (!fetched.ok) return fetched.reply
      return formatSlotsOffer(fetched.ctx, fetched.slots, period)
    }

    if (affirmative && botOfferedTomorrow(lastBot)) {
      const tomorrow = parseTomorrowFromBotOffer(lastBot, todayIso())
      if (tomorrow) {
        ctx = await saveCtx(params.chatId, {
          selectedDate: tomorrow,
          selectedTime: null,
          preferredPeriod: null,
        })
        return `Perfeito. Prefere amanhã (${formatDateBr(tomorrow)}) pela manhã ou à tarde?`
      }
    }

    if (affirmative && botAskedPeriodChoice(lastBot) && ctx.preferredPeriod) {
      const fetched = await fetchSlotsForContext(params, ctx, { period: ctx.preferredPeriod })
      if (!fetched.ok) return fetched.reply
      return formatSlotsOffer(fetched.ctx, fetched.slots, ctx.preferredPeriod)
    }

    if (affirmative && botOfferedAfternoonStart(lastBot)) {
      ctx = await saveCtx(params.chatId, { preferredPeriod: "afternoon" })
      const fetched = await fetchSlotsForContext(params, ctx, { period: "afternoon" })
      if (!fetched.ok) return fetched.reply
      return formatSlotsOffer(fetched.ctx, fetched.slots, "afternoon")
    }

    if (affirmative && ctx.availableSlots?.length === 1) {
      const time = ctx.availableSlots[0]
      const reply = await lockTimeAndAskConfirm(params, ctx, time)
      if (reply) return reply
    }

    const preferredTime = parseTimeFromText(text)
    if (preferredTime) {
      const reply = await lockTimeAndAskConfirm(params, ctx, preferredTime)
      if (reply) return reply
      const pool = ctx.availableSlots ?? []
      if (pool.length > 0 && !pool.includes(preferredTime)) {
        const near = nearestSlots(preferredTime, pool, 2)
        await saveCtx(params.chatId, { availableSlots: near.length ? near : pool })
        return `${preferredTime} não está disponível. Os horários mais próximos são ${near.join(" e ")}. Qual prefere?`
      }
    }
  }

  if (
    (state === "BOOKING_SELECT_TIME" ||
      state === "BOOKING_AWAITING_CONFIRMATION" ||
      state === "BOOKING_RETRY" ||
      state === "BOOKING_AWAITING_RESCHEDULE") &&
    !ctx.awaitingConfirmation
  ) {
    const time = parseTimeFromText(text)
    if (time && ctx.selectedDoctor && ctx.selectedDate) {
      const reply = await lockTimeAndAskConfirm(params, ctx, time)
      if (reply) return reply
    }
  }

  return null
}
