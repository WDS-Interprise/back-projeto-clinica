import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"
import type { WaitingListPriority, WaitingListStatus } from "@prisma/client"

const include = {
  patient: { select: { id: true, name: true, phone: true, email: true, insurancePlan: true } },
  doctor: { select: { id: true, name: true, specialty: true } },
  createdBy: { select: { id: true, name: true } },
}

function doctorWhere(ctx: AuthContext) {
  const df = appointmentDoctorFilter(ctx)
  if (!df.doctorId) return {}
  if (typeof df.doctorId === "string") {
    return { OR: [{ doctorId: df.doctorId }, { doctorId: null }] }
  }
  if (typeof df.doctorId === "object" && "in" in df.doctorId) {
    return { OR: [{ doctorId: df.doctorId }, { doctorId: null }] }
  }
  return {}
}

export async function list(
  ctx: AuthContext,
  params: { doctorId?: string; status?: string }
) {
  const where: Record<string, unknown> = {
    clinicId: ctx.clinicId,
    ...doctorWhere(ctx),
  }

  if (params.status) where.status = params.status
  if (params.doctorId) {
    if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
      if (ctx.linkedDoctorIds.includes(params.doctorId)) {
        where.doctorId = params.doctorId
      }
    } else {
      where.doctorId = params.doctorId
    }
  }

  return prisma.waitingListEntry.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include,
  })
}

export async function getById(ctx: AuthContext, id: string) {
  return prisma.waitingListEntry.findFirst({
    where: { id, clinicId: ctx.clinicId, ...doctorWhere(ctx) },
    include,
  })
}

export async function create(
  ctx: AuthContext,
  data: {
    patientId: string
    doctorId?: string
    desiredSpecialty?: string
    priority?: WaitingListPriority
    notes?: string
  }
) {
  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId },
  })
  if (!patient) throw new Error("PATIENT_NOT_FOUND")

  if (data.doctorId && ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    if (!ctx.linkedDoctorIds.includes(data.doctorId)) {
      throw new Error("DOCTOR_NOT_LINKED")
    }
  }

  return prisma.waitingListEntry.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: data.patientId,
      doctorId: data.doctorId ?? null,
      desiredSpecialty: data.desiredSpecialty ?? null,
      priority: data.priority ?? "NORMAL",
      status: "WAITING",
      notes: data.notes ?? null,
      createdById: ctx.userId,
    },
    include,
  })
}

export async function update(
  ctx: AuthContext,
  id: string,
  data: Partial<{
    doctorId: string | null
    desiredSpecialty: string
    priority: WaitingListPriority
    status: WaitingListStatus
    notes: string
  }>
) {
  const existing = await getById(ctx, id)
  if (!existing) return null

  return prisma.waitingListEntry.update({
    where: { id },
    data,
    include,
  })
}

export async function remove(ctx: AuthContext, id: string) {
  const existing = await getById(ctx, id)
  if (!existing) throw new Error("NOT_FOUND")
  await prisma.waitingListEntry.delete({ where: { id } })
}
