import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"

export async function list(
  ctx: AuthContext | null,
  params: { available?: boolean; specialty?: string }
) {
  const where: Record<string, any> = {}

  if (params.available !== undefined) where.available = params.available
  if (params.specialty) where.specialty = { contains: params.specialty }

  if (ctx?.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    where.id = { in: ctx.linkedDoctorIds }
  } else if (ctx?.role === "DOCTOR" && ctx.doctorId) {
    where.id = ctx.doctorId
  }

  const doctors = await prisma.doctor.findMany({ where, orderBy: { name: "asc" } })
  return doctors
}

export async function getById(id: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      appointments: { orderBy: { date: "desc" }, take: 20 },
    },
  })
  return doctor
}

export async function create(data: any) {
  const doctor = await prisma.doctor.create({ data })
  return doctor
}

export async function update(id: string, data: any) {
  const doctor = await prisma.doctor.update({ where: { id }, data })
  return doctor
}

export async function remove(id: string) {
  await prisma.doctor.delete({ where: { id } })
}
