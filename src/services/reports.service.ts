import { endOfDay, startOfDay } from "date-fns"
import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

function periodRange(dateFrom?: string, dateTo?: string) {
  return {
    from: dateFrom ? startOfDay(new Date(dateFrom)) : startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: dateTo ? endOfDay(new Date(dateTo)) : endOfDay(new Date()),
  }
}

export async function attendanceReport(
  ctx: AuthContext,
  params: {
    dateFrom?: string
    dateTo?: string
    doctorId?: string
    insurancePlan?: string
    status?: string
  }
) {
  const { from: dateFrom, to: dateTo } = periodRange(params.dateFrom, params.dateTo)

  const where: Record<string, unknown> = {
    clinicId: ctx.clinicId,
    type: "SCHEDULE",
    date: { gte: dateFrom, lte: dateTo },
    ...appointmentDoctorFilter(ctx),
  }

  if (params.doctorId) where.doctorId = params.doctorId
  if (params.insurancePlan) where.insurancePlan = params.insurancePlan
  if (params.status) where.status = params.status

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    include: {
      patient: { select: { id: true, name: true, insurancePlan: true } },
      doctor: { select: { id: true, name: true, specialty: true } },
      procedures: {
        include: { procedure: { select: { id: true, name: true } } },
      },
      billing: true,
    },
  })

  const byStatus = new Map<string, number>()
  const byInsurance = new Map<string, number>()
  const byDoctor = new Map<string, { name: string; count: number }>()

  for (const apt of appointments) {
    byStatus.set(apt.status, (byStatus.get(apt.status) ?? 0) + 1)
    const ins = apt.insurancePlan || apt.patient?.insurancePlan || "Particular"
    byInsurance.set(ins, (byInsurance.get(ins) ?? 0) + 1)
    const doc = byDoctor.get(apt.doctorId) ?? { name: apt.doctor.name, count: 0 }
    doc.count += 1
    byDoctor.set(apt.doctorId, doc)
  }

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    total: appointments.length,
    byStatus: [...byStatus.entries()].map(([label, value]) => ({ label, value })),
    byInsurance: [...byInsurance.entries()].map(([label, value]) => ({ label, value })),
    byDoctor: [...byDoctor.entries()].map(([id, data]) => ({ id, ...data })),
    rows: appointments.map((apt) => ({
      id: apt.id,
      date: apt.date.toISOString(),
      startTime: apt.startTime,
      status: apt.status,
      insurancePlan: apt.insurancePlan,
      patient: apt.patient,
      doctor: apt.doctor,
      procedures: apt.procedures.map((p) => ({
        name: p.procedure.name,
        quantity: p.quantity,
        unitPrice: Number(p.unitPrice),
      })),
      billingTotal: apt.billing ? Number(apt.billing.totalAmount) : null,
      billingStatus: apt.billing?.billingStatus ?? null,
    })),
  }
}

export async function noShowsReport(ctx: AuthContext, params: { dateFrom?: string; dateTo?: string }) {
  const { from, to } = periodRange(params.dateFrom, params.dateTo)
  const rows = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      type: "SCHEDULE",
      status: "NO_SHOW",
      date: { gte: from, lte: to },
      ...appointmentDoctorFilter(ctx),
    },
    orderBy: [{ date: "desc" }],
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    total: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      startTime: r.startTime,
      patient: r.patient,
      doctor: r.doctor,
    })),
  }
}

export async function birthdaysReport(ctx: AuthContext, params: { month?: number }) {
  const month = params.month ?? new Date().getMonth() + 1
  const patients = await prisma.patient.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    select: { id: true, name: true, birthDate: true, phone: true, email: true },
    orderBy: { name: "asc" },
  })

  const rows = patients
    .filter((p) => p.birthDate.getMonth() + 1 === month)
    .map((p) => ({
      id: p.id,
      name: p.name,
      birthDate: p.birthDate.toISOString(),
      day: p.birthDate.getDate(),
      phone: p.phone,
      email: p.email,
    }))
    .sort((a, b) => a.day - b.day)

  return { month, total: rows.length, rows }
}

export async function cidReport(ctx: AuthContext, params: { dateFrom?: string; dateTo?: string }) {
  const { from, to } = periodRange(params.dateFrom, params.dateTo)
  const rows = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      type: "SCHEDULE",
      status: "COMPLETED",
      cidCode: { not: null },
      date: { gte: from, lte: to },
      ...appointmentDoctorFilter(ctx),
    },
    select: {
      id: true,
      date: true,
      cidCode: true,
      cidDescription: true,
      patient: { select: { id: true, name: true } },
    },
  })

  const byCid = new Map<string, { description: string; count: number }>()
  for (const r of rows) {
    const code = r.cidCode ?? "-"
    const entry = byCid.get(code) ?? { description: r.cidDescription ?? "", count: 0 }
    entry.count += 1
    byCid.set(code, entry)
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    total: rows.length,
    byCid: [...byCid.entries()].map(([code, data]) => ({ code, ...data })),
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      cidCode: r.cidCode,
      cidDescription: r.cidDescription,
      patient: r.patient,
    })),
  }
}

export async function doctorRepasseReport(ctx: AuthContext, params: { dateFrom?: string; dateTo?: string }) {
  const { from, to } = periodRange(params.dateFrom, params.dateTo)
  const txs = await prisma.financialTransaction.findMany({
    where: {
      clinicId: ctx.clinicId,
      type: "INCOME",
      status: "PAID",
      doctorId: { not: null },
      date: { gte: from, lte: to },
    },
    include: { doctor: { select: { id: true, name: true } } },
  })

  const byDoctor = new Map<string, { name: string; total: number; count: number }>()
  for (const tx of txs) {
    if (!tx.doctorId || !tx.doctor) continue
    const entry = byDoctor.get(tx.doctorId) ?? { name: tx.doctor.name, total: 0, count: 0 }
    entry.total += Number(tx.amount)
    entry.count += 1
    byDoctor.set(tx.doctorId, entry)
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    rows: [...byDoctor.entries()].map(([id, data]) => ({ id, ...data })),
  }
}

export async function prescriptionsReport(
  ctx: AuthContext,
  params: { dateFrom?: string; dateTo?: string }
) {
  const { from, to } = periodRange(params.dateFrom, params.dateTo)
  const clinicId = ctx.clinicId

  const prescriptions = await prisma.prescription.findMany({
    where: {
      clinicId,
      status: "FINALIZED",
      updatedAt: { gte: from, lte: to },
    },
    include: {
      professional: { select: { id: true, name: true } },
      patient: { select: { name: true } },
      signature: { select: { status: true, legalClass: true } },
      shares: {
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          channel: true,
          recipient: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const byProfessional = new Map<string, { name: string; count: number }>()
  let simulated = 0
  let unsigned = 0
  let sharesSent = 0
  let sharesFailed = 0
  let sharesPending = 0
  const byChannel: Record<string, number> = { WHATSAPP: 0, EMAIL: 0, SMS: 0 }
  const failedShares: Array<{
    date: string
    channel: string
    recipient: string
    error: string
    patientName: string
    professionalName: string
  }> = []

  for (const rx of prescriptions) {
    const prof = byProfessional.get(rx.professionalId) ?? {
      name: rx.professional.name,
      count: 0,
    }
    prof.count += 1
    byProfessional.set(rx.professionalId, prof)

    const simulatedSig =
      rx.signature?.status === "SIMULATED" || rx.signature?.legalClass === "SIMULATION"
    if (simulatedSig) simulated += 1
    else if (!rx.signature) unsigned += 1

    for (const share of rx.shares) {
      byChannel[share.channel] = (byChannel[share.channel] ?? 0) + 1
      if (share.status === "SENT") sharesSent += 1
      else if (share.status === "FAILED") {
        sharesFailed += 1
        failedShares.push({
          date: share.createdAt.toISOString(),
          channel: share.channel,
          recipient: share.recipient,
          error: share.errorMessage ?? "-",
          patientName: rx.patient.name,
          professionalName: rx.professional.name,
        })
      } else sharesPending += 1
    }
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      finalized: prescriptions.length,
      simulated,
      unsigned,
      sharesSent,
      sharesFailed,
      sharesPending,
      byChannel,
    },
    byProfessional: [...byProfessional.entries()].map(([id, data]) => ({ id, ...data })),
    failedShares,
  }
}
