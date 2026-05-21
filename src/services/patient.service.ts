import prisma from "@/lib/prisma.js"
import {
  normalizeCpf,
  validatePatientCreate,
  validatePatientUpdate,
} from "@/lib/duplicate-validation.js"
import type { AuthContext } from "@/types/index.js"

const CLINICAL_FIELDS = ["allergies", "medications", "bloodType"] as const

export async function list(
  ctx: AuthContext,
  params: { search?: string; page?: number; limit?: number }
) {
  const { search, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { clinicId: ctx.clinicId }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { cpf: { contains: search } },
      { phone: { contains: search } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.patient.count({ where }),
  ])

  return { data, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getById(ctx: AuthContext, id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      appointments: { orderBy: { date: "desc" }, take: 10 },
      records: { orderBy: { date: "desc" }, take: 10 },
    },
  })
  return patient
}

function mapPatientData(data: any, clinicId: string) {
  const mapped: any = { ...data, clinicId }
  if (typeof data.birthDate === "string") {
    mapped.birthDate = new Date(data.birthDate)
  }
  if (data.email === "") mapped.email = null
  if (typeof data.cpf === "string") mapped.cpf = normalizeCpf(data.cpf)
  if (data.phoneHome === "") mapped.phoneHome = null
  if (data.whatsapp === "") mapped.whatsapp = null
  if (data.insuranceCard === "") mapped.insuranceCard = null
  if (data.notes === "") mapped.notes = null
  if (!data.insurancePlan) mapped.insurancePlan = "Particular"
  if (data.active === undefined) mapped.active = true
  return mapped
}

function stripClinicalFields(data: any) {
  const out = { ...data }
  for (const f of CLINICAL_FIELDS) {
    delete out[f]
  }
  return out
}

export async function create(ctx: AuthContext, data: any) {
  await validatePatientCreate(
    { name: data.name, email: data.email, cpf: data.cpf },
    ctx.clinicId
  )

  let payload = mapPatientData(data, ctx.clinicId)
  if (ctx.role === "RECEPTION") {
    payload = stripClinicalFields(payload)
  }

  const patient = await prisma.patient.create({ data: payload })
  return patient
}

export async function update(ctx: AuthContext, id: string, data: any) {
  const existing = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) return null

  await validatePatientUpdate(id, ctx.clinicId, {
    name: data.name,
    email: data.email,
    cpf: data.cpf,
  })

  let payload = mapPatientData({ ...existing, ...data }, ctx.clinicId)
  delete payload.clinicId

  if (ctx.role === "RECEPTION") {
    payload = stripClinicalFields(payload)
  }

  const patient = await prisma.patient.update({ where: { id }, data: payload })
  return patient
}

export async function remove(ctx: AuthContext, id: string) {
  const existing = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  await prisma.patient.delete({ where: { id } })
}
