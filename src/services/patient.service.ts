import prisma from "@/lib/prisma.js"
import {
  normalizeCpf,
  validatePatientCreate,
  validatePatientUpdate,
  findPatientMatch,
} from "@/lib/duplicate-validation.js"
import type { AuthContext } from "@/types/index.js"

const CLINICAL_FIELDS = [
  "allergies",
  "medications",
  "bloodType",
  "clinicalHistory",
  "surgicalHistory",
  "familyHistory",
  "habits",
] as const

export async function list(
  ctx: AuthContext,
  params: { search?: string; page?: number; limit?: number; includeInactive?: boolean }
) {
  const { search, page = 1, limit = 20, includeInactive = false } = params
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { clinicId: ctx.clinicId }
  if (!includeInactive) where.active = true

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

  const canReadClinical = ctx.permissions.includes("records:view")
  return {
    data: canReadClinical ? data : data.map((p) => stripClinicalFields(p)),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getById(ctx: AuthContext, id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: {
      appointments: { orderBy: { date: "desc" }, take: 10 },
      records: ctx.permissions.includes("records:view")
        ? { orderBy: { date: "desc" }, take: 10 }
        : false,
    },
  })
  if (!patient) return patient
  if (!ctx.permissions.includes("records:view")) {
    return stripClinicalFields(patient)
  }
  return patient
}

function mapPatientData(data: any, clinicId: string) {
  const mapped: any = { ...data, clinicId }
  delete mapped.force
  if (typeof data.birthDate === "string") {
    mapped.birthDate = new Date(data.birthDate)
  }
  if (data.email === "") mapped.email = null
  if (typeof data.cpf === "string") {
    const cpfDigits = normalizeCpf(data.cpf)
    mapped.cpf = cpfDigits.length === 11 ? cpfDigits : null
  } else if (!data.cpf) {
    mapped.cpf = null
  }
  if (typeof data.phone === "string") {
    mapped.phone = data.phone.replace(/\D/g, "")
  }
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
    { name: data.name, email: data.email, cpf: data.cpf, phone: data.phone, force: Boolean(data.force) },
    ctx.clinicId
  )

  let payload = mapPatientData(data, ctx.clinicId)
  if (!ctx.permissions.includes("patients:edit_clinical")) {
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
    phone: data.phone,
  })

  let payload = mapPatientData({ ...existing, ...data }, ctx.clinicId)
  delete payload.clinicId

  if (!ctx.permissions.includes("patients:edit_clinical")) {
    payload = stripClinicalFields(payload)
  }

  const patient = await prisma.patient.update({ where: { id }, data: payload })
  return patient
}

export async function archive(ctx: AuthContext, id: string) {
  const existing = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  return prisma.patient.update({
    where: { id },
    data: { active: false },
  })
}

export async function lookupMatch(
  ctx: AuthContext,
  query: { cpf?: string; email?: string; phone?: string }
) {
  return findPatientMatch(ctx.clinicId, query)
}
