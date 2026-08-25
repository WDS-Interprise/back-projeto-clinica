import { format } from "date-fns"
import { clinicNowMinutes, clinicTodayIso } from "@/lib/clinic-time.js"
import {
  addMinutesToTime,
  generateAgendaSlots,
  isWithinWorkHours,
  overlapsLunch,
  parseAgendaSchedule,
  timeRangesOverlap,
  normalizeTimeHHmm,
  timeToMinutes,
} from "@/lib/agenda-schedule.js"
import prisma from "@/lib/prisma.js"
import type { AppointmentStatus, AppointmentType, Prisma, Recurrence } from "@prisma/client"
import {
  appointmentInclude,
  buildRecurrenceDates,
  computeTotal,
  parseDateOnly,
  type ProcedureInput,
} from "@/lib/appointment-helpers.js"
import { appointmentDoctorFilter, canViewAppointmentPatient } from "@/lib/auth-context.js"
import { assertDoctorInClinic } from "@/lib/doctor-clinic.js"
import { writeAuditLogInTx } from "@/lib/audit-log.js"
import { cancelFromAppointment } from "@/services/encounter.service.js"
import {
  assertAppointmentStatusTransition,
  clinicalStatusRequiresRecordsWrite,
  isClinicalStatusTransition,
} from "@/lib/appointment-status.js"
import type { AuthContext } from "@/types/index.js"

export async function list(
  ctx: AuthContext,
  params: {
    date?: string
    startDate?: string
    endDate?: string
    doctorId?: string
    patientId?: string
    status?: string
    page?: number
    limit?: number
  }
) {
  const { date, startDate, endDate, doctorId, patientId, status, page = 1, limit = 200 } = params
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {
    clinicId: ctx.clinicId,
    ...appointmentDoctorFilter(ctx),
  }

  if (date) {
    const d = parseDateOnly(date)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    where.date = { gte: d, lt: next }
  } else if (startDate && endDate) {
    const start = parseDateOnly(startDate)
    const end = parseDateOnly(endDate)
    end.setDate(end.getDate() + 1)
    where.date = { gte: start, lt: end }
  }

  if (doctorId) {
    if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
      if (ctx.linkedDoctorIds.includes(doctorId)) {
        where.doctorId = doctorId
      }
    } else if (ctx.role === "DOCTOR" && ctx.doctorId) {
      if (doctorId === ctx.doctorId) where.doctorId = doctorId
    } else {
      where.doctorId = doctorId
    }
  }
  if (patientId) where.patientId = patientId
  if (status) where.status = status

  const [data, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: appointmentInclude,
    }),
    prisma.appointment.count({ where }),
  ])

  return { data: data.map((row) => presentAppointment(ctx, row)), total, page, totalPages: Math.ceil(total / limit) }
}

export async function getById(ctx: AuthContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
    include: appointmentInclude,
  })
  return appointment ? presentAppointment(ctx, appointment) : null
}

type CreateInput = {
  type?: AppointmentType
  patientId?: string | null
  doctorId: string
  date: string
  startTime: string
  endTime: string
  status?: AppointmentStatus
  insurancePlan?: string
  recurrence?: Recurrence
  notes?: string
  generatePaymentLink?: boolean
  procedures?: ProcedureInput[]
  waitingListEntryId?: string
  cidCode?: string | null
  cidDescription?: string | null
  cidVersion?: string | null
  mainComplaint?: string | null
  physicalExam?: string | null
  currentIllnessHistory?: string | null
  historyAndAntecedents?: string | null
  conduct?: string | null
  prescriptionSummary?: string | null
}

type AppointmentTimelineFields = {
  startedAt: Date | null
  endedAt: Date | null
}

function appointmentTimeline(appointment: unknown): AppointmentTimelineFields {
  const row = appointment as AppointmentTimelineFields
  return {
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
  }
}

function buildAppointmentUpdateData(
  data: Partial<CreateInput> & { status?: AppointmentStatus },
  existing: unknown
): Prisma.AppointmentUncheckedUpdateInput {
  const { startedAt, endedAt } = appointmentTimeline(existing)

  return {
    type: data.type,
    patientId: data.patientId === undefined ? undefined : data.patientId,
    doctorId: data.doctorId,
    date: data.date ? parseDateOnly(data.date) : undefined,
    startTime: data.startTime,
    endTime: data.endTime,
    status: data.status,
    insurancePlan: data.insurancePlan,
    notes: data.notes,
    generatePaymentLink: data.generatePaymentLink,
    cidCode: data.cidCode === undefined ? undefined : data.cidCode,
    cidDescription: data.cidDescription === undefined ? undefined : data.cidDescription,
    cidVersion: data.cidVersion === undefined ? undefined : data.cidVersion,
    mainComplaint: data.mainComplaint === undefined ? undefined : data.mainComplaint,
    physicalExam: data.physicalExam === undefined ? undefined : data.physicalExam,
    currentIllnessHistory:
      data.currentIllnessHistory === undefined ? undefined : data.currentIllnessHistory,
    historyAndAntecedents:
      data.historyAndAntecedents === undefined ? undefined : data.historyAndAntecedents,
    conduct: data.conduct === undefined ? undefined : data.conduct,
    prescriptionSummary:
      data.prescriptionSummary === undefined ? undefined : data.prescriptionSummary,
    ...(data.status === "IN_PROGRESS" && existing && (existing as { status?: string }).status !== "IN_PROGRESS" && !startedAt
      ? { startedAt: new Date() }
      : {}),
    ...(data.status === "COMPLETED" && !endedAt ? { endedAt: new Date() } : {}),
  } as Prisma.AppointmentUncheckedUpdateInput
}

async function getClinicSchedule(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } })
  return parseAgendaSchedule(clinic ?? undefined)
}

async function validateAppointmentTimes(
  clinicId: string,
  type: AppointmentType | undefined,
  startTime: string,
  endTime: string
) {
  if (type === "BLOCK") return

  const schedule = await getClinicSchedule(clinicId)
  if (!isWithinWorkHours(startTime, endTime, schedule)) {
    throw new Error("OUTSIDE_WORK_HOURS")
  }
  if (overlapsLunch(startTime, endTime, schedule)) {
    throw new Error("LUNCH_HOURS")
  }
}

async function createOne(ctx: AuthContext, data: CreateInput, date: Date) {
  const procedures = data.procedures ?? []
  const total = computeTotal(procedures)

  if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(data.doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
  }
  if (ctx.role === "DOCTOR" && ctx.doctorId && data.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }

  await assertDoctorInClinic(ctx.clinicId, data.doctorId)

  await validateAppointmentTimes(ctx.clinicId, data.type, data.startTime, data.endTime)

  let notes = data.notes ?? null
  if (data.waitingListEntryId) {
    const prefix = "Agendamento criado a partir da lista de espera."
    notes = notes ? `${prefix} ${notes}` : prefix
  }

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: ctx.clinicId,
      waitingListEntryId: data.waitingListEntryId ?? null,
      type: data.type ?? "SCHEDULE",
      patientId: data.type === "BLOCK" ? null : data.patientId ?? null,
      doctorId: data.doctorId,
      date,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status ?? "SCHEDULED",
      insurancePlan: data.insurancePlan ?? "Particular",
      recurrence: data.recurrence ?? "NONE",
      notes,
      generatePaymentLink: data.generatePaymentLink ?? false,
      paymentLinkUrl: data.generatePaymentLink
        ? `https://pay.clinichub.local/${Date.now()}`
        : null,
      paymentStatus: data.generatePaymentLink ? "PENDING" : "NONE",
      procedures: {
        create: procedures.map((p) => ({
          procedureId: p.procedureId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
      },
      billing: {
        create: {
          totalAmount: total,
          chargedAmount: 0,
          billingStatus: "PENDING",
        },
      },
    },
    include: appointmentInclude,
  })

  if (data.waitingListEntryId) {
    await prisma.waitingListEntry.update({
      where: { id: data.waitingListEntryId },
      data: { status: "SCHEDULED" },
    })
  }

  return serializeAppointment(appointment)
}

export async function create(ctx: AuthContext, data: CreateInput) {
  const baseDate = parseDateOnly(data.date)
  const recurrence = data.recurrence ?? "NONE"
  const dates = buildRecurrenceDates(baseDate, recurrence)

  const created = []
  for (const d of dates) {
    created.push(await createOne(ctx, data, d))
  }

  return created.length === 1 ? created[0] : { series: created, count: created.length }
}

export async function update(
  ctx: AuthContext,
  id: string,
  data: Partial<CreateInput> & { status?: AppointmentStatus }
) {
  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
    include: { procedures: true, billing: true },
  })
  if (!existing) return null

  if (data.status && data.status !== existing.status) {
    assertAppointmentStatusTransition({
      from: existing.status,
      to: data.status,
      type: data.type ?? existing.type,
    })
    if (clinicalStatusRequiresRecordsWrite(data.status)) {
      if (!ctx.permissions.includes("records:write")) {
        throw new Error("CLINICAL_STATUS_FORBIDDEN")
      }
    }
    if (isClinicalStatusTransition(existing.status, data.status) && data.status === "IN_PROGRESS") {
      // Preferir Encounter.start; ainda permitido para compat, mas exige records:write (já checado).
    }
  }

  const clinicalKeys: (keyof CreateInput)[] = [
    "mainComplaint",
    "physicalExam",
    "currentIllnessHistory",
    "historyAndAntecedents",
    "conduct",
    "prescriptionSummary",
    "cidCode",
    "cidDescription",
    "cidVersion",
  ]
  const touchesClinical = clinicalKeys.some((k) => data[k] !== undefined)
  if (touchesClinical && !ctx.permissions.includes("records:write")) {
    throw new Error("CLINICAL_STATUS_FORBIDDEN")
  }

  if (existing.status === "COMPLETED" && touchesClinical) {
    throw new Error("APPOINTMENT_CLOSED")
  }

  if (data.doctorId && ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(data.doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
  }
  if (data.doctorId && ctx.role === "DOCTOR" && ctx.doctorId && data.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  if (data.doctorId) {
    await assertDoctorInClinic(ctx.clinicId, data.doctorId)
  }

  const nextType = data.type ?? existing.type
  const nextStart = data.startTime ?? existing.startTime
  const nextEnd = data.endTime ?? existing.endTime
  if (data.startTime || data.endTime || data.type) {
    await validateAppointmentTimes(ctx.clinicId, nextType, nextStart, nextEnd)
  }

  const procedures = data.procedures
  const total = procedures ? computeTotal(procedures) : undefined

  await prisma.$transaction(async (tx) => {
    if (procedures) {
      await tx.appointmentProcedure.deleteMany({ where: { appointmentId: id } })
      await tx.appointmentProcedure.createMany({
        data: procedures.map((p) => ({
          appointmentId: id,
          procedureId: p.procedureId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
      })
      if (existing.billing && total !== undefined) {
        await tx.appointmentBilling.update({
          where: { appointmentId: id },
          data: { totalAmount: total },
        })
      }
    }

    await tx.appointment.update({
      where: { id },
      data: buildAppointmentUpdateData(data, existing),
    })

    if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
      await cancelFromAppointment(ctx, id, tx)
    }

    if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      const openEncounter = await tx.encounter.findFirst({
        where: { appointmentId: id, clinicId: ctx.clinicId, status: "IN_PROGRESS" },
      })
      const now = new Date()
      if (openEncounter) {
        await tx.encounter.update({
          where: { id: openEncounter.id },
          data: { status: "COMPLETED", endedAt: now, lastSavedAt: now, version: { increment: 1 } },
        })
        await writeAuditLogInTx(tx, {
          clinicId: ctx.clinicId,
          userId: ctx.userId,
          actorRole: ctx.role,
          module: "Atendimento",
          action: "ENCOUNTER_COMPLETED",
          entityType: "Encounter",
          entityId: openEncounter.id,
          description: "Atendimento clinico finalizado via agendamento",
          metadata: { appointmentId: id },
          required: true,
        })
      } else if (existing.patientId && ctx.permissions.includes("records:write")) {
        await tx.encounter.create({
          data: {
            clinicId: ctx.clinicId,
            appointmentId: id,
            patientId: existing.patientId,
            doctorId: existing.doctorId,
            status: "COMPLETED",
            startedAt: existing.startedAt ?? now,
            endedAt: now,
            lastSavedAt: now,
            mainComplaint: existing.mainComplaint,
            physicalExam: existing.physicalExam,
            currentIllnessHistory: existing.currentIllnessHistory,
            historyAndAntecedents: existing.historyAndAntecedents,
            conduct: existing.conduct,
            prescriptionSummary: existing.prescriptionSummary,
            notes: existing.notes,
            cidCode: existing.cidCode,
            cidDescription: existing.cidDescription,
            cidVersion: existing.cidVersion,
          },
        })
      }
    }
  })

  return getById(ctx, id)
}

export async function remove(ctx: AuthContext, id: string) {
  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
  })
  if (!existing) throw new Error("NOT_FOUND")
  await prisma.appointment.delete({ where: { id } })
}

export async function charge(ctx: AuthContext, id: string, amount?: number) {
  const { chargeAppointment } = await import("./clinmax-pay.service.js")
  return chargeAppointment(ctx, id, amount)
}

export async function receipt(ctx: AuthContext, id: string) {
  const { receiptAppointment } = await import("./clinmax-pay.service.js")
  return receiptAppointment(ctx, id)
}

export type SlotQueryOptions = {
  excludeAppointmentId?: string
}

export async function listPatientAppointmentsOnDate(
  ctx: AuthContext,
  patientId: string,
  dateStr: string
) {
  const day = parseDateOnly(dateStr)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  return prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      type: { not: "BLOCK" },
      date: { gte: day, lt: next },
      status: { in: ["SCHEDULED", "CONFIRMED"] },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      doctorId: true,
      doctor: { select: { name: true } },
    },
  })
}

export async function listFreeSlots(
  ctx: AuthContext,
  doctorId: string,
  dateStr: string,
  options?: SlotQueryOptions
) {
  if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
  }
  if (ctx.role === "DOCTOR" && ctx.doctorId && doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }

  const schedule = await getClinicSchedule(ctx.clinicId)
  const allSlots = generateAgendaSlots(schedule)
  const day = parseDateOnly(dateStr)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)

  const busy = await prisma.appointment.findMany({
    where: {
      doctorId,
      date: { gte: day, lt: next },
      status: { notIn: ["CANCELLED"] },
      ...(options?.excludeAppointmentId ? { NOT: { id: options.excludeAppointmentId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true, patientId: true },
  })

  const interval = schedule.slotIntervalMinutes

  let horarios = allSlots
    .filter((slot) => {
      const slotEnd = addMinutesToTime(slot, interval)
      return !busy.some((apt) =>
        timeRangesOverlap(apt.startTime, apt.endTime, slot, slotEnd)
      )
    })
    .map((startTime) => ({
      startTime,
      endTime: addMinutesToTime(startTime, interval),
    }))

  const todayStr = clinicTodayIso()
  if (dateStr === todayStr) {
    const nowMinutes = clinicNowMinutes()
    horarios = horarios.filter((h) => timeToMinutes(h.startTime) > nowMinutes)
  }

  return {
    totalSlots: allSlots.length,
    totalLivres: horarios.length,
    intervaloMinutos: interval,
    expedienteInicio: schedule.agendaStartTime,
    expedienteFim: schedule.agendaEndTime,
    horarios,
  }
}

export async function isSlotAvailable(
  ctx: AuthContext,
  doctorId: string,
  dateStr: string,
  startTime: string,
  options?: SlotQueryOptions
) {
  const normalized = normalizeTimeHHmm(startTime)
  if (!normalized) {
    return { disponivel: false, erro: "Horário inválido. use HH:mm" }
  }

  const { horarios, intervaloMinutos } = await listFreeSlots(ctx, doctorId, dateStr, options)
  const match = horarios.find((h) => h.startTime === normalized)

  return {
    disponivel: !!match,
    horarioSolicitado: normalized,
    inicio: match?.startTime ?? null,
    fim: match?.endTime ?? null,
    intervaloMinutos,
    horariosProximos: horarios
      .filter((h) => Math.abs(timeToMinutes(h.startTime) - timeToMinutes(normalized)) <= 90)
      .slice(0, 6)
      .map((h) => ({ inicio: h.startTime, fim: h.endTime })),
  }
}

export async function findNextFreeSlot(ctx: AuthContext, doctorId: string, dateStr: string) {
  const { horarios } = await listFreeSlots(ctx, doctorId, dateStr)
  if (horarios.length > 0) {
    return { startTime: horarios[0].startTime, endTime: horarios[0].endTime }
  }

  const schedule = await getClinicSchedule(ctx.clinicId)
  const fallbackEnd = addMinutesToTime(schedule.agendaStartTime, schedule.slotIntervalMinutes)
  return { startTime: schedule.agendaStartTime, endTime: fallbackEnd }
}

export async function sendReminder(
  ctx: AuthContext,
  id: string,
  options?: { templateId?: string; body?: string; purpose?: "reminder" | "reschedule" }
) {
  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
  })
  if (!existing) throw new Error("NOT_FOUND")

  const { sendAppointmentReminder } = await import("./whatsapp-reminder.service.js")
  await sendAppointmentReminder(ctx, id, options)
  const appointment = await prisma.appointment.findFirst({
    where: { id },
    include: appointmentInclude,
  })
  if (!appointment) throw new Error("NOT_FOUND")
  return presentAppointment(ctx, appointment)
}

function serializeAppointment(apt: any) {
  const activeEncounter = apt.encounters?.[0] ?? null
  return {
    ...apt,
    time: apt.startTime,
    encounterId: activeEncounter?.id ?? null,
    encounterStatus: activeEncounter?.status ?? null,
    totalAmount: apt.billing ? Number(apt.billing.totalAmount) : 0,
    chargedAmount: apt.billing ? Number(apt.billing.chargedAmount) : 0,
    billingStatus: apt.billing?.billingStatus ?? "PENDING",
    procedures: apt.procedures?.map((line: any) => ({
      id: line.id,
      procedureId: line.procedureId,
      name: line.procedure?.name,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      subtotal: line.quantity * Number(line.unitPrice),
    })),
  }
}

function presentAppointment(ctx: AuthContext, apt: any) {
  const row = serializeAppointment(apt)
  if (canViewAppointmentPatient(ctx, apt)) return { ...row, occupancyOnly: false }
  return {
    ...row,
    occupancyOnly: true,
    patientId: null,
    patient: null,
    notes: null,
    insurancePlan: null,
    billing: null,
    billingStatus: null,
    totalAmount: 0,
    chargedAmount: 0,
    procedures: [],
  }
}
