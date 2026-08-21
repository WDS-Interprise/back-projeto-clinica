import { format } from "date-fns"
import prisma from "@/lib/prisma.js"
import { normalizeCpf, DuplicateFieldsError } from "@/lib/duplicate-validation.js"
import { systemAuthContext } from "@/lib/ai-system-context.js"
import type { AuthContext } from "@/types/index.js"
import * as appointmentService from "@/services/appointment.service.js"
import * as patientService from "@/services/patient.service.js"
import { sendAppointmentReminder } from "@/services/whatsapp-reminder.service.js"
import { sendMessageNow } from "@/services/whatsapp-messaging.service.js"
import { resendWhatsApp } from "@/services/prescription.service.js"
import { tryNormalizeWhatsappPhone } from "@/whatsapp/phone.js"
import { addMinutesToTime, normalizeTimeHHmm, timeToMinutes } from "@/lib/agenda-schedule.js"
import { parseDateOnly } from "@/lib/appointment-helpers.js"
import {
  formatDoctorForPatientListing,
  isDoctorVisibleToPatients,
  doctorNameMatchesQuery,
} from "@/lib/doctor-display-filter.js"
import {
  extractPhoneDigitsFromText,
  formatPhoneBrDisplay,
  parseBirthDateInput,
  parseGenderInput,
} from "@/lib/patient-input-parse.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import {
  mergeAiContext,
  parseAiContext,
  stringifyAiContext,
  type WhatsappAiContext,
} from "@/lib/whatsapp-ai-context.js"
import {
  parseAiPermissions,
  isToolAllowed,
  canExecuteToolInMode,
  buildAiToolsDoc,
  type AiMode,
} from "@/lib/ai-permissions.js"
import { resolveClinicDoctor } from "@/lib/whatsapp-doctor-resolve.js"
import { attachSurveyToConfirmedBooking } from "@/services/whatsapp-satisfaction-orchestrator.js"

export type AiToolContext = {
  clinicId: string
  connectionId: string
  chatId: string
  phoneDigits: string
  patientId: string | null
}

function appointmentDateYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd")
  }
  const raw = String(value ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return format(parsed, "yyyy-MM-dd")
  return raw
}

function prismaErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code
  if (code === "P2003") return "Médico, paciente ou procedimento inválido"
  if (code === "P2002") return "Já existe um agendamento com esses dados"
  if (err instanceof Error) {
    if (err.message === "OUTSIDE_WORK_HOURS") return "Horário fora do expediente"
    if (err.message === "LUNCH_HOURS") return "Horário cai no intervalo de almoço"
    return err.message
  }
  return "Erro ao agendar"
}

function presentDayAppointment(row: {
  id: string
  date: Date
  startTime: string
  endTime: string
  doctorId: string
  doctor: { name: string }
}) {
  return {
    id: row.id,
    data: format(row.date, "yyyy-MM-dd"),
    dataBr: format(row.date, "dd/MM/yyyy"),
    horario: row.startTime,
    fim: row.endTime,
    doctorId: row.doctorId,
    medico: row.doctor.name,
  }
}

function maskCpf(cpf: string | null | undefined): string | null {
  const digits = (cpf ?? "").replace(/\D/g, "")
  if (digits.length < 4) return null
  return `final ${digits.slice(-4)}`
}

async function loadChatAiContext(chatId: string): Promise<WhatsappAiContext> {
  const chat = await prisma.whatsappChat.findUnique({
    where: { id: chatId },
    select: { aiContextJson: true },
  })
  return parseAiContext(chat?.aiContextJson)
}

async function saveChatAiContext(chatId: string, patch: Partial<WhatsappAiContext>) {
  const current = await loadChatAiContext(chatId)
  const next = mergeAiContext(current, patch)
  await prisma.whatsappChat.update({
    where: { id: chatId },
    data: { aiContextJson: stringifyAiContext(next) },
  })
  return next
}

function chatPhoneMatchesPatient(patient: {
  phone: string | null
  whatsapp: string | null
}, phoneDigits: string): boolean {
  const target = tryNormalizeWhatsappPhone(phoneDigits) ?? phoneDigits.replace(/\D/g, "")
  for (const raw of [patient.whatsapp, patient.phone]) {
    const normalized = tryNormalizeWhatsappPhone(raw ?? "")
    if (normalized && normalized === target) return true
  }
  return false
}

const patientSelect = {
  id: true,
  name: true,
  phone: true,
  whatsapp: true,
  email: true,
  cpf: true,
  birthDate: true,
  gender: true,
} as const

async function findPatientByPhone(clinicId: string, phoneDigits: string) {
  const target =
    tryNormalizeWhatsappPhone(phoneDigits) ?? phoneDigits.replace(/\D/g, "")
  const patients = await prisma.patient.findMany({
    where: { clinicId, active: true },
    select: patientSelect,
  })
  for (const p of patients) {
    for (const raw of [p.whatsapp, p.phone]) {
      const normalized = tryNormalizeWhatsappPhone(raw ?? "")
      if (normalized && normalized === target) return p
    }
  }
  return null
}

async function findPatientByCpf(clinicId: string, cpf: string) {
  return prisma.patient.findFirst({
    where: { clinicId, cpf, active: true },
    select: { ...patientSelect, clinicId: true, active: true },
  })
}

async function linkChatToPatient(ctx: AiToolContext, patientId: string) {
  await prisma.whatsappChat.update({
    where: { id: ctx.chatId },
    data: { patientId },
  })
  ctx.patientId = patientId
}

async function resolvePatientId(
  ctx: AiToolContext,
  args: { patientId?: unknown; cpf?: unknown }
): Promise<string | null> {
  if (args.patientId) return String(args.patientId)
  if (ctx.patientId) return ctx.patientId
  const byPhone = await findPatientByPhone(ctx.clinicId, ctx.phoneDigits)
  if (byPhone) return byPhone.id
  if (args.cpf) {
    const cpf = normalizeCpf(String(args.cpf))
    if (cpf.length === 11) {
      const byCpf = await prisma.patient.findFirst({
        where: { clinicId: ctx.clinicId, cpf, active: true },
        select: { id: true },
      })
      if (byCpf) return byCpf.id
    }
  }
  return null
}

async function runResolverPaciente(
  auth: AuthContext,
  ctx: AiToolContext,
  args: Record<string, unknown>
): Promise<string> {
  const cpf = normalizeCpf(String(args.cpf ?? ""))
  if (cpf.length !== 11) {
    return JSON.stringify({ sucesso: false, erro: "CPF inválido. informe 11 dígitos" })
  }

  const existing = await findPatientByCpf(ctx.clinicId, cpf)

  if (existing?.active) {
    if (existing.clinicId && existing.clinicId !== ctx.clinicId) {
      return JSON.stringify({
        sucesso: false,
        erro: "CPF já cadastrado em outra unidade",
      })
    }
    const phone = String(args.telefone ?? args.phone ?? existing.phone ?? "").trim()
    const whatsapp = String(args.whatsapp ?? phone ?? existing.whatsapp ?? "").trim()
    const email = args.email ? String(args.email).trim() : existing.email
    const updated = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        ...(phone ? { phone } : {}),
        ...(whatsapp ? { whatsapp } : {}),
        ...(email ? { email } : {}),
        ...(existing.clinicId ? {} : { clinicId: ctx.clinicId }),
      },
      select: patientSelect,
    })
    await linkChatToPatient(ctx, updated.id)
    return JSON.stringify({
      sucesso: true,
      criado: false,
      jaExistia: true,
      id: updated.id,
      nome: updated.name,
      cpfMascarado: maskCpf(updated.cpf),
      mensagem: "Paciente já cadastrado. dados de contato atualizados. Não repita CPF completo ao paciente.",
    })
  }

  const name = String(args.nome ?? args.name ?? "").trim()
  const phone = String(args.telefone ?? args.phone ?? "").trim()
  if (!name || name.length < 2) {
    return JSON.stringify({ sucesso: false, erro: "Informe o nome completo" })
  }
  if (!phone) {
    return JSON.stringify({ sucesso: false, erro: "Informe o telefone" })
  }

  const birthRaw = String(args.dataNascimento ?? args.birthDate ?? "").trim()
  const genderRaw = String(args.sexo ?? args.gender ?? "").trim()
  const parsedBirth = birthRaw ? parseBirthDateInput(birthRaw) : { iso: null, displayBr: null }
  const parsedGender = parseGenderInput(genderRaw)

  if (!parsedBirth.iso) {
    return JSON.stringify({
      sucesso: false,
      erro: parsedBirth.error ?? "Informe a data de nascimento (ex.: 14/04/2007 ou 14042007)",
    })
  }
  if (!parsedGender) {
    return JSON.stringify({
      sucesso: false,
      erro: "Informe o sexo: masculino, feminino ou M/F",
    })
  }

  const birthDate = parsedBirth.iso
  const gender = parsedGender
  const notesExtra = "Cadastro via assistente IA WhatsApp"

  try {
    const created = await patientService.create(auth, {
      name,
      cpf,
      phone,
      whatsapp: String(args.whatsapp ?? phone).trim(),
      email: args.email ? String(args.email).trim() : null,
      birthDate,
      gender,
      notes: notesExtra,
    })
    await linkChatToPatient(ctx, created.id)
    await saveChatAiContext(ctx.chatId, {
      patientId: created.id,
      intent: "BOOK_APPOINTMENT",
      bookingState: "BOOKING_SELECT_DOCTOR",
    })
    const phoneDisplay = formatPhoneBrDisplay(phone)
    return JSON.stringify({
      sucesso: true,
      criado: true,
      jaExistia: false,
      id: created.id,
      nome: created.name,
      cpfMascarado: maskCpf(created.cpf),
      telefoneFormatado: phoneDisplay,
      nascimentoFormatado: parsedBirth.displayBr,
      sexo: gender,
      mensagem: "Paciente cadastrado com sucesso",
      instrucao:
        "Informe ao paciente que o cadastro foi finalizado. Não mencione ferramentas.",
    })
  } catch (err) {
    if (err instanceof DuplicateFieldsError) {
      const byCpf = await findPatientByCpf(ctx.clinicId, cpf)
      if (byCpf) {
        await linkChatToPatient(ctx, byCpf.id)
        return JSON.stringify({
          sucesso: true,
          criado: false,
          jaExistia: true,
          id: byCpf.id,
          nome: byCpf.name,
          cpfMascarado: maskCpf(byCpf.cpf),
          mensagem: "Paciente já existia no sistema. Não repita CPF completo ao paciente.",
        })
      }
      return JSON.stringify({
        sucesso: false,
        erro: Object.values(err.fields).filter(Boolean).join(" "),
        campos: err.fields,
      })
    }
    const msg = err instanceof Error ? err.message : "Erro ao cadastrar paciente"
    return JSON.stringify({ sucesso: false, erro: msg })
  }
}

function pickHorariosParaOferecer(horarios: { startTime: string }[]): string[] {
  if (horarios.length <= 6) {
    return horarios.map((h) => h.startTime)
  }

  const picks = new Set<string>()
  picks.add(horarios[0].startTime)
  picks.add(horarios[Math.floor(horarios.length / 2)].startTime)
  picks.add(horarios[horarios.length - 1].startTime)

  const manha = horarios.find((h) => timeToMinutes(h.startTime) < 12 * 60)
  const tarde = horarios.find((h) => timeToMinutes(h.startTime) >= 13 * 60)
  if (manha) picks.add(manha.startTime)
  if (tarde) picks.add(tarde.startTime)

  return horarios
    .map((h) => h.startTime)
    .filter((t) => picks.has(t))
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
}

export async function executeAiTool(
  tool: string,
  args: Record<string, unknown>,
  ctx: AiToolContext
): Promise<string> {
  const settings = await prisma.clinicWhatsappSettings.findUnique({
    where: { clinicId: ctx.clinicId },
  })
  const perms = parseAiPermissions(settings?.aiPermissionsJson)
  const aiMode = (settings?.aiMode as AiMode) ?? "MANUAL"

  if (!isToolAllowed(tool, perms)) {
    return JSON.stringify({
      sucesso: false,
      erro: "Esta ação não está habilitada nas configurações de IA da clínica.",
    })
  }
  if (!canExecuteToolInMode(aiMode, tool)) {
    return JSON.stringify({
      sucesso: false,
      erro: "Modo de IA permite apenas respostas informativas. Encaminhe a um atendente para executar esta ação.",
    })
  }

  const auth = systemAuthContext(ctx.clinicId)

  switch (tool) {
    case "buscar_paciente": {
      const patient =
        (args.patientId
          ? await prisma.patient.findFirst({
              where: { id: String(args.patientId), clinicId: ctx.clinicId, active: true },
              select: patientSelect,
            })
          : null) ?? (await findPatientByPhone(ctx.clinicId, ctx.phoneDigits))
      if (!patient) {
        return JSON.stringify({
          encontrado: false,
          telefone: ctx.phoneDigits,
          mensagem: "Paciente não cadastrado com este telefone.",
        })
      }
      await linkChatToPatient(ctx, patient.id)
      await saveChatAiContext(ctx.chatId, {
        patientId: patient.id,
        intent: "BOOK_APPOINTMENT",
        bookingState: "BOOKING_SELECT_DOCTOR",
      })
      return JSON.stringify({
        encontrado: true,
        id: patient.id,
        nome: patient.name,
        cpfMascarado: maskCpf(patient.cpf),
        telefone: patient.phone,
        whatsapp: patient.whatsapp,
        email: patient.email,
        instrucao: "Não cite CPF completo. Use só cpfMascarado se precisar confirmar.",
      })
    }

    case "buscar_paciente_cpf": {
      const cpf = normalizeCpf(String(args.cpf ?? ""))
      if (cpf.length !== 11) {
        return JSON.stringify({ encontrado: false, erro: "CPF inválido. informe 11 dígitos" })
      }
      const patient = await findPatientByCpf(ctx.clinicId, cpf)
      if (!patient) {
        return JSON.stringify({ encontrado: false, cpf, mensagem: "CPF não cadastrado" })
      }
      await linkChatToPatient(ctx, patient.id)
      await saveChatAiContext(ctx.chatId, {
        patientId: patient.id,
        intent: "BOOK_APPOINTMENT",
        bookingState: "BOOKING_SELECT_DOCTOR",
      })
      return JSON.stringify({
        encontrado: true,
        id: patient.id,
        nome: patient.name,
        cpfMascarado: maskCpf(patient.cpf),
        telefone: patient.phone,
        whatsapp: patient.whatsapp,
        email: patient.email,
        instrucao: "Não cite CPF completo ao paciente.",
      })
    }

    case "buscar_paciente_nome": {
      const nome = String(args.nome ?? args.name ?? "").trim()
      if (nome.length < 2) {
        return JSON.stringify({ erro: "Informe ao menos 2 caracteres do nome" })
      }
      const patients = await prisma.patient.findMany({
        where: { clinicId: ctx.clinicId, active: true, name: { contains: nome } },
        select: patientSelect,
        take: 5,
        orderBy: { name: "asc" },
      })
      if (patients.length === 1) {
        await saveChatAiContext(ctx.chatId, {
          patientId: patients[0].id,
          intent: "BOOK_APPOINTMENT",
          bookingState: "BOOKING_SELECT_DOCTOR",
        })
      }
      return JSON.stringify({
        total: patients.length,
        ambiguo: patients.length > 1,
        pacientes: patients.map((p) => ({
          id: p.id,
          nome: p.name,
          cpfMascarado: maskCpf(p.cpf),
        })),
        instrucao:
          patients.length > 1
            ? "Há mais de um cadastro com esse nome. NÃO escolha sozinho. Peça CPF ou data de nascimento."
            : patients.length === 1
              ? "Um cadastro encontrado. Confirme o nome com o paciente. Não cite CPF completo."
              : "Nenhum cadastro. Colete dados para criar.",
      })
    }

    case "criar_paciente":
    case "resolver_paciente":
      return runResolverPaciente(auth, ctx, args)

    case "listar_medicos": {
      const nomeQuery = String(args.nome ?? args.name ?? "").trim()
      const doctors = await prisma.doctor.findMany({
        where: {
          available: true,
          userId: { not: null },
          OR: [
            { user: { clinics: { some: { clinicId: ctx.clinicId, active: true } } } },
            { appointments: { some: { clinicId: ctx.clinicId } } },
          ],
        },
        select: {
          id: true,
          name: true,
          specialty: true,
          available: true,
          userId: true,
          hasOwnAgenda: true,
        },
        orderBy: { name: "asc" },
        take: 40,
      })
      let visiveis = doctors.filter(isDoctorVisibleToPatients).map(formatDoctorForPatientListing)
      if (nomeQuery) {
        visiveis = visiveis.filter((d) => doctorNameMatchesQuery(d.nome, nomeQuery))
      }
      const medicos = visiveis.map((d, i) => ({
        indice: i + 1,
        id: d.id,
        nome: d.nome,
        especialidade: d.especialidade,
      }))
      const stored = await loadChatAiContext(ctx.chatId)
      const nextState =
        medicos.length === 1
          ? stored.selectedDate
            ? "BOOKING_SELECT_TIME"
            : "BOOKING_SELECT_DATE"
          : stored.selectedDoctor ||
              stored.bookingState === "BOOKING_AWAITING_CONFIRMATION" ||
              stored.bookingState === "BOOKING_AWAITING_RESCHEDULE" ||
              stored.bookingState === "BOOKING_RETRY" ||
              stored.bookingState === "BOOKING_CONFIRMED" ||
              stored.bookingState === "BOOKING_SELECT_TIME" ||
              stored.bookingState === "BOOKING_SELECT_DATE"
            ? stored.bookingState ?? "BOOKING_SELECT_DOCTOR"
            : "BOOKING_SELECT_DOCTOR"
      await saveChatAiContext(ctx.chatId, {
        intent: "BOOK_APPOINTMENT",
        bookingState: nextState,
        listedDoctors: medicos.map((d) => ({ indice: d.indice, id: d.id, name: d.nome })),
        ...(medicos.length === 1
          ? { selectedDoctor: medicos[0].id, selectedDoctorName: medicos[0].nome }
          : {}),
        ...(ctx.patientId ? { patientId: ctx.patientId } : {}),
      })
      return JSON.stringify({
        total: medicos.length,
        busca: nomeQuery || null,
        medicos,
        instrucao: nomeQuery
          ? medicos.length > 0
            ? "Mostre estes profissionais com o indice. Depois que o paciente escolher, use o id. Não busque de novo por texto tipo Dr. Jr."
            : "A busca não achou esse nome nesta clínica. Liste de novo sem filtro e pergunte com quem o paciente prefere. Não invente médico."
          : "Mostre TODOS com indice, nome e especialidade (sem telefone). Quando o paciente escolher, use o id. Não resolva médico por apelido depois da escolha.",
      })
    }

    case "listar_procedimentos": {
      const rows = await prisma.procedure.findMany({
        where: { active: true },
        select: { id: true, name: true, defaultPrice: true },
        orderBy: { name: "asc" },
        take: 40,
      })
      return JSON.stringify(
        rows.map((p) => ({ id: p.id, nome: p.name, preco: Number(p.defaultPrice) }))
      )
    }

    case "buscar_horarios": {
      const date = String(args.date ?? "")
      const stored = await loadChatAiContext(ctx.chatId)
      const resolved = await resolveClinicDoctor({
        clinicId: ctx.clinicId,
        doctorId: String(args.doctorId ?? stored.selectedDoctor ?? ""),
        nameHint: stored.selectedDoctorName,
        listedDoctors: stored.listedDoctors,
      })
      if (!resolved || !date) {
        return JSON.stringify({ erro: "Informe um profissional válido e date (YYYY-MM-DD)" })
      }
      const doctorId = resolved.id
      const patientId =
        ctx.patientId ?? (await findPatientByPhone(ctx.clinicId, ctx.phoneDigits))?.id ?? null
      const existing = patientId
        ? await appointmentService.listPatientAppointmentsOnDate(auth, patientId, date)
        : []
      const excludeId = existing[0]?.id
      const free = await appointmentService.listFreeSlots(
        auth,
        doctorId,
        date,
        excludeId ? { excludeAppointmentId: excludeId } : undefined
      )
      const doctor = { name: resolved.name }
      const horarios = free.horarios.map((h) => ({
        inicio: h.startTime,
        fim: h.endTime,
      }))
      const exemplos = pickHorariosParaOferecer(free.horarios)
      const diaInteiroLivre = free.totalLivres === free.totalSlots && free.totalLivres > 0

      await saveChatAiContext(ctx.chatId, {
        intent: "BOOK_APPOINTMENT",
        selectedDoctor: doctorId,
        selectedDoctorName: doctor?.name ?? "",
        selectedDate: date,
        bookingState: "BOOKING_SELECT_TIME",
        availableSlots: exemplos,
        toolFailureCount: 0,
        ...(ctx.patientId ? { patientId: ctx.patientId } : {}),
      })

      const consultasDoPacienteNoDia = existing.map(presentDayAppointment)
      if (consultasDoPacienteNoDia[0]) {
        await saveChatAiContext(ctx.chatId, { existingAppointmentId: consultasDoPacienteNoDia[0].id })
      }

      let instrucao: string
      if (consultasDoPacienteNoDia.length > 0) {
        const atual = consultasDoPacienteNoDia[0]
        instrucao = `O paciente JÁ TEM consulta neste dia às ${atual.horario} com ${atual.medico}. Avise isso e pergunte se deseja remarcar. Não crie outra consulta no mesmo dia.`
      } else if (free.totalLivres === 0) {
        instrucao =
          "Não há horários livres neste dia. Sugira outra data e use buscar_horarios novamente."
      } else if (diaInteiroLivre) {
        instrucao =
          "O dia está inteiramente livre. Ofereça várias opções de horário (manhã e tarde) e pergunte a preferência do paciente. NÃO mencione apenas 08:00."
      } else {
        instrucao = `Há ${free.totalLivres} horários livres. Informe os disponíveis ou pergunte se prefere manhã ou tarde.`
      }

      return JSON.stringify({
        doctorId,
        medico: doctor?.name ?? "",
        date,
        totalLivres: free.totalLivres,
        diaInteiroLivre,
        expediente: `${free.expedienteInicio} às ${free.expedienteFim}`,
        intervaloMinutos: free.intervaloMinutos,
        horarios,
        horariosParaOferecer: exemplos,
        consultasDoPacienteNoDia,
        instrucao: `${instrucao} Horários no passado (hoje) já foram removidos. Cada slot dura ${free.intervaloMinutos} min. Ao falar com o paciente, diga "verifiquei os horários". nunca cite nomes de ferramentas. Se falhar, diga uma vez que não conseguiu consultar. Nunca diga que está resolvendo.`,
      })
    }

    case "verificar_horario": {
      const date = String(args.date ?? "")
      const startTime = String(args.startTime ?? args.horario ?? "")
      const stored = await loadChatAiContext(ctx.chatId)
      const resolved = await resolveClinicDoctor({
        clinicId: ctx.clinicId,
        doctorId: String(args.doctorId ?? stored.selectedDoctor ?? ""),
        nameHint: stored.selectedDoctorName,
        listedDoctors: stored.listedDoctors,
      })
      if (!resolved || !date || !startTime) {
        return JSON.stringify({ erro: "Informe um profissional válido, date e startTime (HH:mm)" })
      }
      const doctorId = resolved.id
      const doctor = { name: resolved.name }
      const patientId =
        ctx.patientId ?? (await findPatientByPhone(ctx.clinicId, ctx.phoneDigits))?.id ?? null
      const existing = patientId
        ? await appointmentService.listPatientAppointmentsOnDate(auth, patientId, date)
        : []
      const sameSlot = existing.find(
        (row) => row.doctorId === doctorId && row.startTime === startTime
      )
      if (sameSlot) {
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          bookingState: "BOOKING_CONFIRMED",
          awaitingConfirmation: false,
          lastAppointmentId: sameSlot.id,
          existingAppointmentId: sameSlot.id,
          selectedDoctor: doctorId,
          selectedDoctorName: doctor?.name ?? sameSlot.doctor.name,
          selectedDate: date,
          selectedTime: startTime,
          ...(patientId ? { patientId } : {}),
        })
        return JSON.stringify({
          disponivel: false,
          jaConfirmada: true,
          jaTemConsulta: true,
          consultaExistente: presentDayAppointment(sameSlot),
          medico: doctor?.name ?? "",
          date,
          mensagem: `O paciente já tem esta consulta às ${sameSlot.startTime}. Confirme que já está marcada. Não crie outra.`,
        })
      }
      const atual = existing[0] ?? null
      const result = await appointmentService.isSlotAvailable(
        auth,
        doctorId,
        date,
        startTime,
        atual ? { excludeAppointmentId: atual.id } : undefined
      )
      if ("erro" in result && result.erro) {
        return JSON.stringify({ ...result, medico: doctor?.name ?? "", date })
      }
      if (atual) {
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          selectedDoctor: doctorId,
          selectedDoctorName: doctor?.name ?? "",
          selectedDate: date,
          selectedTime: result.disponivel ? startTime : null,
          awaitingConfirmation: Boolean(result.disponivel),
          bookingState: result.disponivel ? "BOOKING_AWAITING_RESCHEDULE" : "BOOKING_SELECT_TIME",
          existingAppointmentId: atual.id,
          lastError: null,
          ...(patientId ? { patientId } : {}),
        })
        const proximos = (result.horariosProximos ?? []).map((h) => h.inicio)
        return JSON.stringify({
          ...result,
          jaTemConsulta: true,
          consultaExistente: presentDayAppointment(atual),
          medico: doctor?.name ?? "",
          date,
          horariosProximos: proximos,
          mensagem: result.disponivel
            ? `O paciente já tem consulta às ${atual.startTime} com ${atual.doctor.name}. Pergunte se deseja remarcar para ${startTime}.`
            : `O paciente já tem consulta às ${atual.startTime}. O horário ${startTime} não está livre. Ofereça remarcação para: ${proximos.join(", ")}.`,
        })
      }
      if (result.disponivel) {
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          selectedDoctor: doctorId,
          selectedDoctorName: doctor?.name ?? "",
          selectedDate: date,
          selectedTime: startTime,
          awaitingConfirmation: true,
          bookingState: "BOOKING_AWAITING_CONFIRMATION",
          lastError: null,
          ...(patientId ? { patientId } : {}),
        })
      }
      return JSON.stringify({
        ...result,
        medico: doctor?.name ?? "",
        date,
        mensagem: result.disponivel
          ? `Horário ${result.inicio} às ${result.fim} está LIVRE neste instante. Confirme com o paciente. No "Pode", o backend consulta de novo.`
          : `Horário ${result.horarioSolicitado} indisponível. Sugira horariosProximos.`,
      })
    }

    case "listar_consultas_paciente": {
      const patientId =
        (args.patientId ? String(args.patientId) : null) ??
        ctx.patientId ??
        (await findPatientByPhone(ctx.clinicId, ctx.phoneDigits))?.id
      if (!patientId) {
        return JSON.stringify({ erro: "Paciente não identificado" })
      }
      const { data } = await appointmentService.list(auth, {
        patientId,
        status: "SCHEDULED",
        limit: 10,
      })
      const upcoming = data.filter(
        (a: { status: string }) => a.status === "SCHEDULED" || a.status === "CONFIRMED"
      )
      return JSON.stringify(
        upcoming.map((a: { id: string; date: string; startTime: string; doctor?: { name: string } }) => ({
          id: a.id,
          data: a.date,
          horario: a.startTime,
          medico: a.doctor?.name ?? "",
        }))
      )
    }

    case "listar_consultas_medico": {
      const doctorId = String(args.doctorId ?? "")
      const date = String(args.date ?? format(new Date(), "yyyy-MM-dd"))
      if (!doctorId) return JSON.stringify({ erro: "Informe doctorId" })
      const { data } = await appointmentService.list(auth, { doctorId, date, limit: 50 })
      return JSON.stringify(
        data.map(
          (a: {
            id: string
            startTime: string
            endTime: string
            status: string
            patient?: { name: string } | null
          }) => ({
            id: a.id,
            horario: `${a.startTime}-${a.endTime}`,
            status: a.status,
            paciente: a.patient?.name ?? "Bloqueio",
          })
        )
      )
    }

    case "agendar_consulta": {
      const confirmacao =
        args.confirmacao === true ||
        args.confirmado === true ||
        String(args.confirmacao ?? "").toLowerCase() === "true"
      if (!confirmacao) {
        return JSON.stringify({
          sucesso: false,
          aguardandoConfirmacao: true,
          erro: "Confirme com o paciente médico, data e horário. Só agende após ele dizer sim e use confirmacao: true.",
        })
      }

      const stored = await loadChatAiContext(ctx.chatId)
      const date = appointmentDateYmd(args.date ?? stored.selectedDate ?? "")
      const startTime = normalizeTimeHHmm(String(args.startTime ?? stored.selectedTime ?? "")) ?? ""
      const resolvedDoctor = await resolveClinicDoctor({
        clinicId: ctx.clinicId,
        doctorId: String(args.doctorId ?? stored.selectedDoctor ?? ""),
        nameHint: String(args.nome ?? stored.selectedDoctorName ?? ""),
        listedDoctors: stored.listedDoctors,
      })
      const doctorId = resolvedDoctor?.id ?? ""
      let patientId = await resolvePatientId(ctx, { ...args, patientId: args.patientId ?? stored.patientId })
      if (!patientId && args.cpf) {
        const resolved = JSON.parse(await runResolverPaciente(auth, ctx, args)) as {
          id?: string
          sucesso?: boolean
        }
        if (resolved.id && resolved.sucesso) patientId = resolved.id
      }
      if (!doctorId || !date || !startTime || !patientId) {
        return JSON.stringify({
          sucesso: false,
          erro: "Campos obrigatórios: doctorId, date, startTime e paciente (use resolver_paciente antes se necessário)",
          recebido: { doctorId: !!doctorId, date, startTime, patientId: !!patientId },
        })
      }

      const doctorRow = resolvedDoctor
      if (!doctorRow) {
        return JSON.stringify({
          sucesso: false,
          erro: "Profissional não encontrado. Chame listar_medicos e use o id retornado.",
        })
      }

      const dayAppointments = await appointmentService.listPatientAppointmentsOnDate(
        auth,
        patientId,
        date
      )
      const sameSlot = dayAppointments.find(
        (row) => row.doctorId === doctorId && row.startTime === startTime
      )
      if (sameSlot) {
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          bookingState: "BOOKING_CONFIRMED",
          awaitingConfirmation: false,
          lastAppointmentId: sameSlot.id,
          existingAppointmentId: sameSlot.id,
          selectedDoctor: doctorId,
          selectedDoctorName: doctorRow.name,
          selectedDate: date,
          selectedTime: startTime,
          patientId,
        })
        return JSON.stringify({
          sucesso: true,
          idempotente: true,
          appointmentId: sameSlot.id,
          data: date,
          horario: sameSlot.startTime,
          medico: sameSlot.doctor.name,
          mensagem: "Consulta já estava registrada. Não crie outra.",
        })
      }

      const requestedExistingId = String(args.appointmentId ?? stored.existingAppointmentId ?? "")
      const existingById = requestedExistingId
        ? await prisma.appointment.findFirst({
            where: {
              id: requestedExistingId,
              clinicId: ctx.clinicId,
              patientId,
              status: { in: ["SCHEDULED", "CONFIRMED"] },
            },
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              doctorId: true,
              doctor: { select: { name: true } },
            },
          })
        : null
      const wantReschedule =
        args.remarcar === true || stored.bookingState === "BOOKING_AWAITING_RESCHEDULE"
      const sameDayExisting = dayAppointments[0] ?? null

      if (sameDayExisting && !wantReschedule) {
        const preview = await appointmentService.isSlotAvailable(auth, doctorId, date, startTime, {
          excludeAppointmentId: sameDayExisting.id,
        })
        const proximos =
          "horariosProximos" in preview ? (preview.horariosProximos ?? []).map((h) => h.inicio) : []
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          existingAppointmentId: sameDayExisting.id,
          selectedDoctor: doctorId,
          selectedDoctorName: doctorRow.name,
          selectedDate: date,
          selectedTime: preview.disponivel ? startTime : null,
          awaitingConfirmation: Boolean(preview.disponivel),
          bookingState: preview.disponivel ? "BOOKING_AWAITING_RESCHEDULE" : "BOOKING_SELECT_TIME",
          patientId,
        })
        return JSON.stringify({
          sucesso: false,
          jaTemConsulta: true,
          aguardandoRemarcacao: Boolean(preview.disponivel),
          consultaExistente: presentDayAppointment(sameDayExisting),
          horarioOcupou: !preview.disponivel,
          horariosProximos: proximos,
          medico: doctorRow.name,
          horario: startTime,
          data: date,
          instrucao: preview.disponivel
            ? `Diga que o paciente já tem horário às ${sameDayExisting.startTime} com ${sameDayExisting.doctor.name} e pergunte se deseja remarcar para ${startTime}. Não diga falha temporária.`
            : `Diga que o paciente já tem horário às ${sameDayExisting.startTime}. O das ${startTime} não está livre. Ofereça: ${proximos.join(", ")}.`,
        })
      }

      const existingToMove = wantReschedule ? existingById ?? sameDayExisting : null

      if (stored.lastAppointmentId && stored.bookingState === "BOOKING_CONFIRMED") {
        const sameDraftSlot =
          stored.selectedDoctor === doctorId &&
          stored.selectedDate === date &&
          stored.selectedTime === startTime
        if (sameDraftSlot) {
          return JSON.stringify({
            sucesso: true,
            idempotente: true,
            appointmentId: stored.lastAppointmentId,
            data: date,
            horario: startTime,
            medico: doctorRow.name,
            mensagem: "Consulta já estava registrada. Não crie outra.",
          })
        }
      }

      const recentDup = await prisma.appointment.findFirst({
        where: {
          clinicId: ctx.clinicId,
          patientId,
          doctorId,
          startTime,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          notes: { contains: "Agendado via assistente IA WhatsApp" },
          createdAt: { gte: new Date(Date.now() - 3 * 60 * 1000) },
        },
        select: { id: true, date: true, startTime: true },
      })
      if (recentDup) {
        const recentDate = format(recentDup.date, "yyyy-MM-dd")
        if (recentDate === date) {
          return JSON.stringify({
            sucesso: true,
            idempotente: true,
            appointmentId: recentDup.id,
            data: date,
            horario: recentDup.startTime,
            mensagem: "Consulta já estava registrada. Não crie outra.",
          })
        }
      }

      const slotOptions = existingToMove ? { excludeAppointmentId: existingToMove.id } : undefined
      const availability = await appointmentService.isSlotAvailable(
        auth,
        doctorId,
        date,
        startTime,
        slotOptions
      )
      if (!availability.disponivel) {
        await saveChatAiContext(ctx.chatId, {
          awaitingConfirmation: false,
          selectedTime: null,
          bookingState: "BOOKING_SELECT_TIME",
          ...(existingToMove ? { existingAppointmentId: existingToMove.id } : {}),
        })
        const proximos =
          "horariosProximos" in availability
            ? (availability.horariosProximos ?? []).map((h) => h.inicio)
            : []
        return JSON.stringify({
          sucesso: false,
          horarioOcupou: true,
          erro: `Horário ${startTime} acabou de ficar indisponível`,
          horariosProximos: proximos,
          instrucao:
            proximos.length > 0
              ? `Diga: Esse horário acabou de ficar indisponível. Tenho ${proximos.join(", ")}.`
              : "Esse horário acabou de ficar indisponível. Ofereça outra data.",
        })
      }
      let endTime = normalizeTimeHHmm(String(args.endTime ?? "")) ?? ""
      if (!endTime) {
        const free = await appointmentService.listFreeSlots(auth, doctorId, date, slotOptions)
        const match = free.horarios.find((h) => h.startTime === startTime)
        endTime = match?.endTime ?? addMinutesToTime(startTime, free.intervaloMinutos)
      }
      let procedures: Array<{ procedureId: string; quantity: number; unitPrice: number }> = []
      if (args.procedureId) {
        const procId = String(args.procedureId)
        const proc = await prisma.procedure.findFirst({
          where: { id: procId, active: true },
          select: { id: true, defaultPrice: true },
        })
        if (proc) {
          procedures = [
            {
              procedureId: proc.id,
              quantity: 1,
              unitPrice: Number(args.unitPrice ?? proc.defaultPrice ?? 0),
            },
          ]
        }
      }
      try {
        const moving = wantReschedule ? existingToMove : null
        const remarcando = Boolean(moving)
        const apt = moving
          ? await appointmentService.update(auth, moving.id, {
              doctorId,
              patientId,
              date,
              startTime,
              endTime,
            })
          : await appointmentService.create(auth, {
              doctorId,
              patientId,
              date,
              startTime,
              endTime,
              status: "SCHEDULED",
              notes: args.notes ? String(args.notes) : "Agendado via assistente IA WhatsApp",
              procedures,
            })
        if (!apt) throw new Error("NOT_FOUND")
        const row = apt as { id: string; date: Date | string; startTime: string }
        const dateYmd = appointmentDateYmd(row.date)
        const aptAt = parseDateOnly(dateYmd)
        const [hh, mm] = String(row.startTime).split(":").map(Number)
        aptAt.setHours(hh ?? 0, mm ?? 0, 0, 0)

        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          awaitingConfirmation: false,
          bookingState: "BOOKING_CONFIRMED",
          selectedDoctor: doctorId,
          selectedDoctorName: doctorRow.name,
          selectedDate: dateYmd,
          selectedTime: row.startTime,
          lastAppointmentId: row.id,
          existingAppointmentId: row.id,
          lastError: null,
          patientId,
        })
        await attachSurveyToConfirmedBooking({
          clinicId: ctx.clinicId,
          chatId: ctx.chatId,
          appointmentId: row.id,
          patientId,
        })
        await writeAuditLog({
          clinicId: ctx.clinicId,
          module: "whatsapp",
          action: remarcando ? "AI_APPOINTMENT_RESCHEDULED" : "AI_APPOINTMENT_CREATED",
          entityType: "Appointment",
          entityId: row.id,
          description: remarcando
            ? "Bot remarcou agendamento após o paciente confirmar"
            : "Bot confirmou e criou agendamento após validação do backend",
          metadata: {
            chatId: ctx.chatId,
            patientId,
            doctorId,
            date: dateYmd,
            startTime: row.startTime,
          },
        })

        const now = new Date()
        const todayStr = format(now, "yyyy-MM-dd")
        const consultaHoje = dateYmd === todayStr
        const horasAteConsulta = (aptAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        const podeMencionarLembrete24h = !consultaHoje && horasAteConsulta >= 24

        return JSON.stringify({
          sucesso: true,
          remarcada: remarcando,
          appointmentId: row.id,
          data: dateYmd,
          dataBr: format(aptAt, "dd/MM/yyyy"),
          horario: row.startTime,
          medico: doctorRow.name,
          consultaHoje,
          podeMencionarLembrete24h,
          mensagem: remarcando
            ? "Consulta remarcada e registrada na agenda"
            : "Consulta confirmada e registrada na agenda",
          instrucaoPaciente: consultaHoje
            ? remarcando
              ? "Diga que a consulta foi remarcada para hoje no horário informado."
              : "Diga que a consulta está confirmada para hoje no horário informado. NÃO mencione lembrete 24h antes."
            : podeMencionarLembrete24h
              ? "Pode mencionar que a clínica envia lembretes automáticos quando configurado."
              : "NÃO prometa lembrete com 24h de antecedência. a consulta é em menos de 24h.",
        })
      } catch (err) {
        console.error("[WhatsApp AI] agendar_consulta falhou:", err)
        const again = await appointmentService.listPatientAppointmentsOnDate(auth, patientId, date)
        if (again[0] && again[0].startTime !== startTime) {
          await saveChatAiContext(ctx.chatId, {
            intent: "BOOK_APPOINTMENT",
            awaitingConfirmation: true,
            bookingState: "BOOKING_AWAITING_RESCHEDULE",
            existingAppointmentId: again[0].id,
            selectedDoctor: doctorId,
            selectedDoctorName: doctorRow.name,
            selectedDate: date,
            selectedTime: startTime,
            patientId,
            lastError: prismaErrorMessage(err),
          })
          return JSON.stringify({
            sucesso: false,
            jaTemConsulta: true,
            aguardandoRemarcacao: true,
            consultaExistente: presentDayAppointment(again[0]),
            medico: doctorRow.name,
            horario: startTime,
            erro: prismaErrorMessage(err),
            instrucao: `Diga que o paciente já tem horário às ${again[0].startTime} com ${again[0].doctor.name} e pergunte se deseja remarcar. Não diga falha temporária.`,
          })
        }
        await saveChatAiContext(ctx.chatId, {
          intent: "BOOK_APPOINTMENT",
          awaitingConfirmation: true,
          bookingState: "BOOKING_RETRY",
          selectedDoctor: doctorId,
          selectedDoctorName: doctorRow.name,
          selectedDate: date,
          selectedTime: startTime,
          patientId,
          lastError: prismaErrorMessage(err),
        })
        return JSON.stringify({
          sucesso: false,
          retry: true,
          erro: prismaErrorMessage(err),
          instrucao:
            "Não apague médico, data e horário. Diga que não conseguiu concluir agora e pergunte se pode tentar o mesmo horário de novo. Não diga que está resolvendo.",
        })
      }
    }

    case "enviar_lembrete_consulta": {
      const appointmentId = String(args.appointmentId ?? "")
      if (!appointmentId) return JSON.stringify({ erro: "Informe appointmentId" })
      try {
        await sendAppointmentReminder(auth, appointmentId)
        return JSON.stringify({ sucesso: true, mensagem: "Lembrete enviado ao paciente" })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao enviar lembrete"
        return JSON.stringify({ sucesso: false, erro: msg })
      }
    }

    case "notificar_medico": {
      const doctorId = String(args.doctorId ?? "")
      const mensagem = String(args.mensagem ?? "").trim()
      if (!doctorId || !mensagem) {
        return JSON.stringify({ erro: "Informe doctorId e mensagem" })
      }
      const doctor = await prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { name: true, phone: true },
      })
      if (!doctor?.phone) {
        return JSON.stringify({ erro: "Médico sem telefone cadastrado" })
      }
      const body = `[ClinMax] Olá Dr(a). ${doctor.name},\n\n${mensagem}`
      try {
        await sendMessageNow({
          clinicId: ctx.clinicId,
          connectionId: ctx.connectionId,
          to: doctor.phone,
          body,
        })
        return JSON.stringify({ sucesso: true, medico: doctor.name })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao notificar médico"
        return JSON.stringify({ sucesso: false, erro: msg })
      }
    }

    case "listar_prescricoes_paciente": {
      const patientId = await resolvePatientId(ctx, args)
      if (!patientId) {
        return JSON.stringify({
          erro: "Identifique o paciente (CPF, telefone ou buscar_paciente) antes de listar prescrições",
        })
      }
      const rows = await prisma.prescription.findMany({
        where: { clinicId: ctx.clinicId, patientId, status: "FINALIZED" },
        orderBy: { prescriptionDate: "desc" },
        take: 8,
        select: {
          id: true,
          prescriptionDate: true,
          sentAt: true,
          professional: { select: { name: true } },
        },
      })
      return JSON.stringify({
        total: rows.length,
        prescricoes: rows.map((r) => ({
          prescriptionId: r.id,
          data: format(r.prescriptionDate, "dd/MM/yyyy"),
          medico: r.professional?.name ?? "",
          jaEnviadaWhatsapp: !!r.sentAt,
        })),
      })
    }

    case "enviar_prescricao_whatsapp": {
      const prescriptionId = String(args.prescriptionId ?? "").trim()
      if (!prescriptionId) {
        return JSON.stringify({ erro: "Informe prescriptionId (use listar_prescricoes_paciente)" })
      }
      const patientId = await resolvePatientId(ctx, args)
      if (!patientId) {
        return JSON.stringify({ erro: "Paciente não identificado para envio da prescrição" })
      }
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: ctx.clinicId, active: true },
        select: { id: true, phone: true, whatsapp: true },
      })
      if (!patient || !chatPhoneMatchesPatient(patient, ctx.phoneDigits)) {
        await writeAuditLog({
          clinicId: ctx.clinicId,
          module: "whatsapp",
          action: "AI_PRESCRIPTION_BLOCKED",
          entityType: "Prescription",
          entityId: prescriptionId,
          description: "Envio de prescrição recusado: WhatsApp não confere com o cadastro",
          metadata: { chatId: ctx.chatId, patientId },
        })
        return JSON.stringify({
          sucesso: false,
          erro: "Este WhatsApp não confere com o telefone do paciente da receita. Encaminhe a um atendente.",
        })
      }
      const rx = await prisma.prescription.findFirst({
        where: {
          id: prescriptionId,
          clinicId: ctx.clinicId,
          patientId,
          status: "FINALIZED",
        },
        select: { id: true },
      })
      if (!rx) {
        return JSON.stringify({
          sucesso: false,
          erro: "Prescrição não encontrada ou ainda não finalizada pelo médico",
        })
      }
      try {
        await resendWhatsApp(auth, prescriptionId, ctx.phoneDigits)
        return JSON.stringify({
          sucesso: true,
          mensagem: "Prescrição enviada no WhatsApp (texto + PDF)",
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao enviar prescrição"
        return JSON.stringify({ sucesso: false, erro: msg })
      }
    }

    case "info_clinica": {
      const clinic = await prisma.clinic.findUnique({
        where: { id: ctx.clinicId },
        select: {
          name: true,
          phone: true,
          email: true,
          agendaStartTime: true,
          agendaEndTime: true,
          addressStreet: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
        },
      })
      const addressParts = [
        clinic?.addressStreet,
        clinic?.addressCity,
        clinic?.addressState,
        clinic?.addressZip,
      ].filter(Boolean)
      const endereco = addressParts.length > 0 ? addressParts.join(", ") : null
      return JSON.stringify({
        nome: clinic?.name ?? "Clínica",
        telefone: clinic?.phone,
        email: clinic?.email,
        endereco,
        horario: clinic
          ? `${clinic.agendaStartTime} às ${clinic.agendaEndTime}`
          : null,
        instrucao: endereco
          ? "Informe o endereço exatamente como retornado. Não invente localização."
          : "Não há endereço cadastrado. Diga isso ao paciente. Nunca invente endereço ou diga 'fica localizada aqui'.",
      })
    }

    default:
      return JSON.stringify({ erro: `Ferramenta desconhecida: ${tool}` })
  }
}

export const AI_TOOLS_DOC = buildAiToolsDoc(parseAiPermissions(undefined))

export function interpretPatientContactBundle(text: string): {
  telefone?: string
  telefoneFormatado?: string
  dataNascimento?: string
  dataNascimentoBr?: string
  sexo?: string
} {
  const lower = text.toLowerCase()
  const phone = extractPhoneDigitsFromText(text)
  const birthMatch = text.match(/\b(\d{6,8})\b/)
  const birthRaw = birthMatch?.[1] ?? ""
  const parsedBirth = birthRaw ? parseBirthDateInput(birthRaw) : { iso: null, displayBr: null }
  let sexo: string | undefined
  if (/masculin| homem|\bh\b/.test(lower)) sexo = "M"
  else if (/feminin| mulher|\bf\b/.test(lower)) sexo = "F"

  return {
    ...(phone ? { telefone: phone, telefoneFormatado: formatPhoneBrDisplay(phone) } : {}),
    ...(parsedBirth.iso
      ? { dataNascimento: parsedBirth.iso, dataNascimentoBr: parsedBirth.displayBr ?? undefined }
      : {}),
    ...(sexo ? { sexo } : {}),
  }
}
