import prisma from "@/lib/prisma.js"
import type { AppointmentStatus, AppointmentType, Recurrence } from "@prisma/client"
import {
  appointmentInclude,
  buildRecurrenceDates,
  computeTotal,
  parseDateOnly,
  type ProcedureInput,
} from "@/lib/appointment-helpers.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
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

  return { data: data.map(serializeAppointment), total, page, totalPages: Math.ceil(total / limit) }
}

export async function getById(ctx: AuthContext, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
    include: appointmentInclude,
  })
  return appointment ? serializeAppointment(appointment) : null
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

  if (data.doctorId && ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(data.doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
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
      data: {
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
      },
    })
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
  const apt = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
    include: { billing: true },
  })
  if (!apt?.billing) throw new Error("BILLING_NOT_FOUND")

  const charged = amount ?? Number(apt.billing.totalAmount)

  const billing = await prisma.appointmentBilling.update({
    where: { appointmentId: id },
    data: {
      chargedAmount: charged,
      billingStatus: "CHARGED",
    },
  })

  return billing
}

export async function receipt(ctx: AuthContext, id: string) {
  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  const billing = await prisma.appointmentBilling.update({
    where: { appointmentId: id },
    data: {
      billingStatus: "RECEIVED",
      receivedAt: new Date(),
    },
  })

  await prisma.appointment.update({
    where: { id },
    data: { paymentStatus: "PAID", status: "COMPLETED" },
  })

  return billing
}

const SLOT_MINUTES = ["08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30", "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "16:00", "16:15", "16:30"]

export async function findNextFreeSlot(ctx: AuthContext, doctorId: string, dateStr: string) {
  if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
  }
  if (ctx.role === "DOCTOR" && ctx.doctorId && doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  const day = parseDateOnly(dateStr)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)

  const busy = await prisma.appointment.findMany({
    where: { doctorId, date: { gte: day, lt: next } },
    select: { startTime: true, endTime: true },
  })

  const busyStarts = new Set(busy.map((b) => b.startTime))

  for (const slot of SLOT_MINUTES) {
    if (!busyStarts.has(slot)) {
      const [h, m] = slot.split(":").map(Number)
      const endM = m + 15
      const endH = h + Math.floor(endM / 60)
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`
      return { startTime: slot, endTime }
    }
  }

  return { startTime: "08:00", endTime: "08:15" }
}

export async function sendReminder(
  ctx: AuthContext,
  id: string,
  options?: { templateId?: string; body?: string }
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
  return serializeAppointment(appointment)
}

function serializeAppointment(apt: any) {
  return {
    ...apt,
    time: apt.startTime,
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
