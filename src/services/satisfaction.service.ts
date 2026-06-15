import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type { SatisfactionSendStatus } from "@prisma/client"

const include = {
  patient: { select: { id: true, name: true, phone: true, email: true } },
  appointment: { select: { id: true, date: true, startTime: true } },
}

export async function listSurveys(
  ctx: AuthContext,
  params: { sendStatus?: SatisfactionSendStatus; dateFrom?: string; dateTo?: string }
) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId }
  if (params.sendStatus) where.sendStatus = params.sendStatus
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
    }
  }

  return prisma.satisfactionSurvey.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include,
  })
}

export async function createSurvey(
  ctx: AuthContext,
  data: { appointmentId?: string; patientId?: string }
) {
  let patientId = data.patientId
  if (data.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, clinicId: ctx.clinicId },
    })
    if (!apt) throw new Error("APPOINTMENT_NOT_FOUND")
    patientId = apt.patientId ?? patientId
  }

  return prisma.satisfactionSurvey.create({
    data: {
      clinicId: ctx.clinicId,
      appointmentId: data.appointmentId || null,
      patientId: patientId || null,
      sendStatus: "PENDING",
    },
    include,
  })
}

export async function markSent(ctx: AuthContext, id: string) {
  const row = await prisma.satisfactionSurvey.findFirst({ where: { id, clinicId: ctx.clinicId } })
  if (!row) throw new Error("NOT_FOUND")
  return prisma.satisfactionSurvey.update({
    where: { id },
    data: { sendStatus: "SENT", sentAt: new Date() },
    include,
  })
}

export async function submitAnswer(ctx: AuthContext, id: string, data: { rating: number; comment?: string }) {
  const row = await prisma.satisfactionSurvey.findFirst({ where: { id, clinicId: ctx.clinicId } })
  if (!row) throw new Error("NOT_FOUND")
  return prisma.satisfactionSurvey.update({
    where: { id },
    data: {
      rating: data.rating,
      comment: data.comment || null,
      sendStatus: "ANSWERED",
      answeredAt: new Date(),
    },
    include,
  })
}

export async function getSummary(ctx: AuthContext, params: { dateFrom?: string; dateTo?: string }) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId, sendStatus: "ANSWERED" }
  if (params.dateFrom || params.dateTo) {
    where.answeredAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
    }
  }

  const answered = await prisma.satisfactionSurvey.findMany({ where, select: { rating: true } })
  const total = answered.length
  const avg = total ? answered.reduce((s, r) => s + (r.rating ?? 0), 0) / total : 0
  const distribution = [1, 2, 3, 4, 5].map((n) => ({
    rating: n,
    count: answered.filter((r) => r.rating === n).length,
  }))

  return { total, average: Math.round(avg * 10) / 10, distribution }
}
