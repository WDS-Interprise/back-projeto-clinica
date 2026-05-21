import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

export async function list(
  ctx: AuthContext,
  params: { patientId?: string; doctorId?: string; page?: number; limit?: number }
) {
  const { patientId, doctorId, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {
    patient: { clinicId: ctx.clinicId },
  }

  if (patientId) where.patientId = patientId
  if (ctx.role === "DOCTOR" && ctx.doctorId) {
    where.doctorId = ctx.doctorId
  } else if (doctorId) {
    where.doctorId = doctorId
  } else {
    const df = appointmentDoctorFilter(ctx)
    if (df.doctorId && typeof df.doctorId === "string") {
      where.doctorId = df.doctorId
    } else if (df.doctorId && typeof df.doctorId === "object" && "in" in df.doctorId) {
      where.doctorId = df.doctorId
    }
  }

  const [data, total] = await Promise.all([
    prisma.medicalRecord.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: "desc" },
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
      },
    }),
    prisma.medicalRecord.count({ where }),
  ])

  return { data, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getById(ctx: AuthContext, id: string) {
  const where: any = {
    id,
    patient: { clinicId: ctx.clinicId },
  }
  if (ctx.role === "DOCTOR" && ctx.doctorId) {
    where.doctorId = ctx.doctorId
  }

  const record = await prisma.medicalRecord.findFirst({
    where,
    include: { patient: true, doctor: true },
  })
  return record
}

export async function create(ctx: AuthContext, data: any) {
  const doctorId = ctx.role === "DOCTOR" && ctx.doctorId ? ctx.doctorId : data.doctorId
  if (!doctorId) throw new Error("DOCTOR_REQUIRED")

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId },
  })
  if (!patient) throw new Error("PATIENT_NOT_FOUND")

  const record = await prisma.medicalRecord.create({
    data: {
      patientId: data.patientId,
      doctorId,
      diagnosis: data.diagnosis,
      prescription: data.prescription,
      notes: data.notes ?? null,
    },
    include: {
      patient: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
  return record
}

export async function update(ctx: AuthContext, id: string, data: any) {
  const existing = await getById(ctx, id)
  if (!existing) return null

  const record = await prisma.medicalRecord.update({
    where: { id },
    data: {
      diagnosis: data.diagnosis,
      prescription: data.prescription,
      notes: data.notes,
    },
    include: {
      patient: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
  return record
}

export async function remove(ctx: AuthContext, id: string) {
  const existing = await getById(ctx, id)
  if (!existing) throw new Error("NOT_FOUND")
  await prisma.medicalRecord.delete({ where: { id } })
}
