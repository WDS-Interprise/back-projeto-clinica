import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type { TissGuideStatus } from "@prisma/client"

const include = {
  patient: { select: { id: true, name: true } },
  doctor: { select: { id: true, name: true } },
  appointment: { select: { id: true, date: true, startTime: true, insurancePlan: true } },
}

export async function listGuides(ctx: AuthContext, params: { status?: TissGuideStatus; search?: string }) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId }
  if (params.status) where.status = params.status
  if (params.search?.trim()) {
    where.OR = [
      { guideNumber: { contains: params.search.trim() } },
      { procedureName: { contains: params.search.trim() } },
      { patient: { name: { contains: params.search.trim() } } },
    ]
  }

  return prisma.tissGuide.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include,
  })
}

export async function createGuide(
  ctx: AuthContext,
  data: {
    appointmentId?: string
    patientId?: string
    doctorId?: string
    insurancePlan?: string
    procedureCode?: string
    procedureName?: string
    amount?: number
    notes?: string
  }
) {
  let patientId = data.patientId
  let doctorId = data.doctorId
  let insurancePlan = data.insurancePlan ?? "Particular"

  if (data.appointmentId) {
    const apt = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, clinicId: ctx.clinicId },
    })
    if (!apt) throw new Error("APPOINTMENT_NOT_FOUND")
    patientId = apt.patientId ?? patientId
    doctorId = apt.doctorId
    insurancePlan = apt.insurancePlan
  }

  return prisma.tissGuide.create({
    data: {
      clinicId: ctx.clinicId,
      appointmentId: data.appointmentId || null,
      patientId: patientId || null,
      doctorId: doctorId || null,
      insurancePlan,
      procedureCode: data.procedureCode || null,
      procedureName: data.procedureName || null,
      amount: data.amount ?? null,
      notes: data.notes || null,
      guideNumber: `G${Date.now().toString().slice(-8)}`,
    },
    include,
  })
}

export async function updateGuideStatus(ctx: AuthContext, id: string, status: TissGuideStatus) {
  const existing = await prisma.tissGuide.findFirst({ where: { id, clinicId: ctx.clinicId } })
  if (!existing) throw new Error("NOT_FOUND")
  return prisma.tissGuide.update({ where: { id }, data: { status }, include })
}
