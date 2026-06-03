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
import { addMinutesToTime, timeToMinutes } from "@/lib/agenda-schedule.js"
import {
  formatDoctorForPatientListing,
  isDoctorVisibleToPatients,
} from "@/lib/doctor-display-filter.js"
import {
  extractPhoneDigitsFromText,
  formatPhoneBrDisplay,
  parseBirthDateInput,
  parseGenderInput,
} from "@/lib/patient-input-parse.js"

export type AiToolContext = {
  clinicId: string
  connectionId: string
  chatId: string
  phoneDigits: string
  patientId: string | null
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
      const byCpf = await prisma.patient.findUnique({
        where: { cpf },
        select: { id: true, clinicId: true, active: true },
      })
      if (byCpf?.active && (!byCpf.clinicId || byCpf.clinicId === ctx.clinicId)) {
        return byCpf.id
      }
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
    return JSON.stringify({ sucesso: false, erro: "CPF inválido — informe 11 dígitos" })
  }

  const existing = await prisma.patient.findUnique({
    where: { cpf },
    select: { ...patientSelect, clinicId: true, active: true },
  })

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
      cpf: updated.cpf,
      mensagem: "Paciente já cadastrado — dados de contato atualizados",
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
    const phoneDisplay = formatPhoneBrDisplay(phone)
    return JSON.stringify({
      sucesso: true,
      criado: true,
      jaExistia: false,
      id: created.id,
      nome: created.name,
      cpf: created.cpf,
      telefoneFormatado: phoneDisplay,
      nascimentoFormatado: parsedBirth.displayBr,
      sexo: gender,
      mensagem: "Paciente cadastrado com sucesso",
      instrucao:
        "Informe ao paciente que o cadastro foi finalizado. Não mencione ferramentas.",
    })
  } catch (err) {
    if (err instanceof DuplicateFieldsError) {
      const byCpf = await prisma.patient.findUnique({ where: { cpf }, select: patientSelect })
      if (byCpf) {
        await linkChatToPatient(ctx, byCpf.id)
        return JSON.stringify({
          sucesso: true,
          criado: false,
          jaExistia: true,
          id: byCpf.id,
          nome: byCpf.name,
          cpf: byCpf.cpf,
          mensagem: "Paciente já existia no sistema",
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
      return JSON.stringify({
        encontrado: true,
        id: patient.id,
        nome: patient.name,
        cpf: patient.cpf,
        telefone: patient.phone,
        whatsapp: patient.whatsapp,
        email: patient.email,
      })
    }

    case "buscar_paciente_cpf": {
      const cpf = normalizeCpf(String(args.cpf ?? ""))
      if (cpf.length !== 11) {
        return JSON.stringify({ encontrado: false, erro: "CPF inválido — informe 11 dígitos" })
      }
      const patient = await prisma.patient.findUnique({
        where: { cpf },
        select: { ...patientSelect, clinicId: true, active: true },
      })
      if (!patient || !patient.active) {
        return JSON.stringify({ encontrado: false, cpf, mensagem: "CPF não cadastrado" })
      }
      if (patient.clinicId && patient.clinicId !== ctx.clinicId) {
        return JSON.stringify({
          encontrado: false,
          cpf,
          mensagem: "CPF cadastrado em outra unidade da clínica",
        })
      }
      await linkChatToPatient(ctx, patient.id)
      return JSON.stringify({
        encontrado: true,
        id: patient.id,
        nome: patient.name,
        cpf: patient.cpf,
        telefone: patient.phone,
        whatsapp: patient.whatsapp,
        email: patient.email,
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
      return JSON.stringify({
        total: patients.length,
        pacientes: patients.map((p) => ({
          id: p.id,
          nome: p.name,
          cpf: p.cpf,
          telefone: p.phone,
        })),
      })
    }

    case "criar_paciente":
    case "resolver_paciente":
      return runResolverPaciente(auth, ctx, args)

    case "listar_medicos": {
      const doctors = await prisma.doctor.findMany({
        where: { available: true, hasOwnAgenda: true, userId: { not: null } },
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
      const visiveis = doctors.filter(isDoctorVisibleToPatients).map(formatDoctorForPatientListing)
      return JSON.stringify({
        total: visiveis.length,
        medicos: visiveis,
        instrucao:
          "Mostre ao paciente APENAS nome e especialidade (sem telefone). Se total for 0, peça para a recepção.",
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
      const doctorId = String(args.doctorId ?? "")
      const date = String(args.date ?? "")
      if (!doctorId || !date) {
        return JSON.stringify({ erro: "Informe doctorId e date (YYYY-MM-DD)" })
      }
      const free = await appointmentService.listFreeSlots(auth, doctorId, date)
      const doctor = await prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { name: true },
      })
      const horarios = free.horarios.map((h) => ({
        inicio: h.startTime,
        fim: h.endTime,
      }))
      const exemplos = pickHorariosParaOferecer(free.horarios)
      const diaInteiroLivre = free.totalLivres === free.totalSlots && free.totalLivres > 0

      let instrucao: string
      if (free.totalLivres === 0) {
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
        instrucao: `${instrucao} Cada slot dura ${free.intervaloMinutos} min. Ao falar com o paciente, diga "verifiquei os horários" — nunca cite nomes de ferramentas.`,
      })
    }

    case "verificar_horario": {
      const doctorId = String(args.doctorId ?? "")
      const date = String(args.date ?? "")
      const startTime = String(args.startTime ?? args.horario ?? "")
      if (!doctorId || !date || !startTime) {
        return JSON.stringify({ erro: "Informe doctorId, date e startTime (HH:mm)" })
      }
      const result = await appointmentService.isSlotAvailable(auth, doctorId, date, startTime)
      const doctor = await prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { name: true },
      })
      if ("erro" in result && result.erro) {
        return JSON.stringify({ ...result, medico: doctor?.name ?? "", date })
      }
      return JSON.stringify({
        ...result,
        medico: doctor?.name ?? "",
        date,
        mensagem: result.disponivel
          ? `Horário ${result.inicio} às ${result.fim} está LIVRE. Consulta que termina exatamente às ${result.inicio} não impede este horário.`
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

      const doctorId = String(args.doctorId ?? "")
      const date = String(args.date ?? "")
      const startTime = String(args.startTime ?? "")
      let patientId = await resolvePatientId(ctx, args)
      if (!patientId && args.cpf) {
        const resolved = JSON.parse(await runResolverPaciente(auth, ctx, args)) as {
          id?: string
          sucesso?: boolean
        }
        if (resolved.id && resolved.sucesso) patientId = resolved.id
      }
      if (!doctorId || !date || !startTime || !patientId) {
        return JSON.stringify({
          erro: "Campos obrigatórios: doctorId, date, startTime e paciente (use resolver_paciente antes se necessário)",
        })
      }
      const availability = await appointmentService.isSlotAvailable(auth, doctorId, date, startTime)
      if (!availability.disponivel) {
        return JSON.stringify({
          sucesso: false,
          erro: `Horário ${startTime} indisponível para agendamento`,
          horariosProximos: availability.horariosProximos,
        })
      }
      let endTime = args.endTime ? String(args.endTime) : ""
      if (!endTime) {
        const free = await appointmentService.listFreeSlots(auth, doctorId, date)
        const match = free.horarios.find((h) => h.startTime === startTime)
        endTime = match?.endTime ?? addMinutesToTime(startTime, free.intervaloMinutos)
      }
      const procedures = args.procedureId
        ? [
            {
              procedureId: String(args.procedureId),
              quantity: 1,
              unitPrice: Number(args.unitPrice ?? 0),
            },
          ]
        : []
      try {
        const apt = await appointmentService.create(auth, {
          doctorId,
          patientId,
          date,
          startTime,
          endTime,
          status: "SCHEDULED",
          notes: args.notes ? String(args.notes) : "Agendado via assistente IA WhatsApp",
          procedures,
        })
        const row = apt as { id: string; date: string; startTime: string }
        const doctor = await prisma.doctor.findUnique({
          where: { id: doctorId },
          select: { name: true },
        })

        const [y, m, d] = row.date.split("-").map(Number)
        const aptAt = new Date(y, m - 1, d)
        const [hh, mm] = row.startTime.split(":").map(Number)
        aptAt.setHours(hh ?? 0, mm ?? 0, 0, 0)
        const now = new Date()
        const todayStr = format(now, "yyyy-MM-dd")
        const consultaHoje = row.date === todayStr
        const horasAteConsulta = (aptAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        const podeMencionarLembrete24h = !consultaHoje && horasAteConsulta >= 24

        return JSON.stringify({
          sucesso: true,
          appointmentId: row.id,
          data: row.date,
          dataBr: format(aptAt, "dd/MM/yyyy"),
          horario: row.startTime,
          medico: doctor?.name ?? "",
          consultaHoje,
          podeMencionarLembrete24h,
          mensagem: "Consulta confirmada e registrada na agenda",
          instrucaoPaciente: consultaHoje
            ? "Diga que a consulta está confirmada para hoje no horário informado. NÃO mencione lembrete 24h antes."
            : podeMencionarLembrete24h
              ? "Pode mencionar que a clínica envia lembretes automáticos quando configurado."
              : "NÃO prometa lembrete com 24h de antecedência — a consulta é em menos de 24h.",
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao agendar"
        return JSON.stringify({ sucesso: false, erro: msg })
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
        },
      })
      return JSON.stringify({
        nome: clinic?.name ?? "Clínica",
        telefone: clinic?.phone,
        email: clinic?.email,
        horario: clinic
          ? `${clinic.agendaStartTime} às ${clinic.agendaEndTime}`
          : null,
      })
    }

    default:
      return JSON.stringify({ erro: `Ferramenta desconhecida: ${tool}` })
  }
}

export const AI_TOOLS_DOC = `
Ferramentas (uma por vez; JSON puro: {"tool":"NOME","args":{...}}):

Cadastro:
- buscar_paciente_cpf — { cpf }
- buscar_paciente — pelo telefone do chat
- buscar_paciente_nome — { nome }
- resolver_paciente — { cpf, nome, telefone, dataNascimento (dd/mm/aaaa ou ddmmaaaa), sexo (masculino/feminino/M/F), email? }
- criar_paciente — igual resolver_paciente

Agenda:
- listar_medicos — sem args (retorna id, nome, especialidade — SEM telefone)
- buscar_horarios — { doctorId, date: YYYY-MM-DD }
- verificar_horario — { doctorId, date, startTime }
- agendar_consulta — { doctorId, date, startTime, confirmacao: true, patientId?, cpf? }
  → confirmacao: true OBRIGATÓRIO após o paciente dizer sim à confirmação de médico/data/hora

Prescrições:
- listar_prescricoes_paciente — { patientId?, cpf? }
- enviar_prescricao_whatsapp — { prescriptionId }

Outros:
- enviar_lembrete_consulta — { appointmentId } — só se sucesso: true
- info_clinica — sem args

Não existe ferramenta de envio de e-mail. Para e-mail, use resolver_paciente com email.
`.trim()

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
