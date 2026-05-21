import prisma from "@/lib/prisma.js"

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "")
}

export type DuplicateField = "name" | "email" | "cpf"
export type DuplicateFieldErrors = Partial<Record<DuplicateField, string>>

export class DuplicateFieldsError extends Error {
  code = "DUPLICATE_FIELDS"
  fields: DuplicateFieldErrors

  constructor(fields: DuplicateFieldErrors) {
    const messages = Object.values(fields).filter(Boolean)
    super(messages.join(" ") || "Dados ja cadastrados")
    this.fields = fields
  }
}

function throwIfAny(fields: DuplicateFieldErrors) {
  if (Object.keys(fields).length > 0) {
    throw new DuplicateFieldsError(fields)
  }
}

async function checkEmail(
  email: string,
  fields: DuplicateFieldErrors,
  exclude?: { userId?: string; patientId?: string }
) {
  const normalized = email.trim().toLowerCase()
  const [userByEmail, patientByEmail] = await Promise.all([
    prisma.user.findFirst({
      where: {
        email: normalized,
        ...(exclude?.userId ? { NOT: { id: exclude.userId } } : {}),
      },
    }),
    prisma.patient.findFirst({
      where: {
        email: normalized,
        ...(exclude?.patientId ? { NOT: { id: exclude.patientId } } : {}),
      },
    }),
  ])
  if (userByEmail || patientByEmail) {
    fields.email = "Este e-mail ja esta cadastrado no sistema"
  }
}

async function checkUserName(
  name: string,
  fields: DuplicateFieldErrors,
  excludeUserId?: string
) {
  const nameLower = name.trim().toLowerCase()
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { name: true },
  })
  if (users.some((u) => u.name.trim().toLowerCase() === nameLower)) {
    fields.name = "Ja existe um usuario com este nome"
  }
}

async function checkCpf(
  cpf: string,
  fields: DuplicateFieldErrors,
  exclude?: { userId?: string; patientId?: string }
) {
  if (cpf.length !== 11) {
    fields.cpf = "CPF deve ter 11 digitos"
    return
  }

  const [userByCpf, patientByCpf, doctorByCpf] = await Promise.all([
    prisma.user.findFirst({
      where: {
        cpf,
        ...(exclude?.userId ? { NOT: { id: exclude.userId } } : {}),
      },
    }),
    prisma.patient.findFirst({
      where: {
        cpf,
        ...(exclude?.patientId ? { NOT: { id: exclude.patientId } } : {}),
      },
    }),
    prisma.doctor.findFirst({ where: { cpf } }),
  ])
  if (userByCpf || patientByCpf || doctorByCpf) {
    fields.cpf = "Este CPF ja esta cadastrado no sistema"
  }
}

async function checkPatientNameInClinic(
  name: string,
  clinicId: string,
  fields: DuplicateFieldErrors,
  excludePatientId?: string
) {
  const nameLower = name.trim().toLowerCase()
  const patients = await prisma.patient.findMany({
    where: {
      clinicId,
      active: true,
      ...(excludePatientId ? { NOT: { id: excludePatientId } } : {}),
    },
    select: { name: true },
  })
  if (patients.some((p) => p.name.trim().toLowerCase() === nameLower)) {
    fields.name = "Ja existe um paciente com este nome nesta clinica"
  }
}

export async function validateRegisterData(data: {
  name: string
  email: string
  cpf: string
}) {
  const fields: DuplicateFieldErrors = {}
  const name = data.name.trim()
  const email = data.email.trim().toLowerCase()
  const cpf = normalizeCpf(data.cpf)

  await Promise.all([
    checkEmail(email, fields),
    checkUserName(name, fields),
    checkCpf(cpf, fields),
  ])

  throwIfAny(fields)
  return { name, email, cpf }
}

export async function validateUserCreate(data: {
  name: string
  email: string
  cpf?: string
}) {
  const fields: DuplicateFieldErrors = {}
  const name = data.name.trim()
  const email = data.email.trim().toLowerCase()

  await checkEmail(email, fields)
  await checkUserName(name, fields)

  const cpf = data.cpf ? normalizeCpf(data.cpf) : ""
  if (cpf) {
    await checkCpf(cpf, fields)
  }

  throwIfAny(fields)
  return { name, email, cpf: cpf || undefined }
}

export async function validateUserUpdate(
  userId: string,
  data: { name?: string; email?: string }
) {
  const fields: DuplicateFieldErrors = {}

  if (data.email) {
    await checkEmail(data.email.trim().toLowerCase(), fields, { userId })
  }
  if (data.name) {
    await checkUserName(data.name, fields, userId)
  }

  throwIfAny(fields)
}

export async function validatePatientCreate(
  data: { name: string; email?: string | null; cpf: string },
  clinicId: string
) {
  const fields: DuplicateFieldErrors = {}
  const name = data.name.trim()
  const cpf = normalizeCpf(data.cpf)
  const email =
    data.email && String(data.email).trim()
      ? String(data.email).trim().toLowerCase()
      : null

  await checkCpf(cpf, fields)
  await checkPatientNameInClinic(name, clinicId, fields)
  if (email) {
    await checkEmail(email, fields)
  }

  throwIfAny(fields)
  return { name, cpf, email }
}

export async function validatePatientUpdate(
  patientId: string,
  clinicId: string,
  data: { name?: string; email?: string | null; cpf?: string }
) {
  const fields: DuplicateFieldErrors = {}

  if (data.cpf) {
    await checkCpf(normalizeCpf(data.cpf), fields, { patientId })
  }
  if (data.name) {
    await checkPatientNameInClinic(data.name, clinicId, fields, patientId)
  }
  if (data.email && String(data.email).trim()) {
    await checkEmail(String(data.email).trim().toLowerCase(), fields, {
      patientId,
    })
  }

  throwIfAny(fields)
}
