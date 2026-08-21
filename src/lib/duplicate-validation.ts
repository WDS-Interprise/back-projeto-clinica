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
  exclude?: { userId?: string }
) {
  const normalized = email.trim().toLowerCase()
  const userByEmail = await prisma.user.findFirst({
    where: {
      email: normalized,
      ...(exclude?.userId ? { NOT: { id: exclude.userId } } : {}),
    },
  })
  if (userByEmail) {
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

  const [userByCpf, doctorByCpf] = await Promise.all([
    prisma.user.findFirst({
      where: {
        cpf,
        ...(exclude?.userId ? { NOT: { id: exclude.userId } } : {}),
      },
    }),
    prisma.doctor.findFirst({ where: { cpf } }),
  ])
  if (userByCpf || doctorByCpf) {
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

export type PatientMatch = {
  id: string
  name: string
  phone: string
  email: string | null
  cpf: string | null
  insurancePlan: string | null
}

export class PatientMatchError extends Error {
  code = "PATIENT_EXISTS"
  match: PatientMatch
  field: "cpf" | "email" | "phone"
  severity: "block" | "warn"

  constructor(match: PatientMatch, field: "cpf" | "email" | "phone", severity: "block" | "warn" = "block") {
    super(
      severity === "block"
        ? `Encontramos ${match.name}. Usar este paciente?`
        : `Há um cadastro com o mesmo ${field === "email" ? "e-mail" : "telefone"}: ${match.name}. Pode ser coincidência.`
    )
    this.match = match
    this.field = field
    this.severity = severity
    this.code = severity === "block" ? "PATIENT_EXISTS" : "PATIENT_POSSIBLE_DUPLICATE"
  }
}

function toMatch(p: {
  id: string
  name: string
  phone: string
  email: string | null
  cpf: string | null
  insurancePlan: string | null
}): PatientMatch {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email,
    cpf: p.cpf,
    insurancePlan: p.insurancePlan,
  }
}

export async function findPatientMatch(
  clinicId: string,
  data: { cpf?: string | null; email?: string | null; phone?: string | null },
  excludePatientId?: string
): Promise<{ match: PatientMatch; field: "cpf" | "email" | "phone" } | null> {
  const cpf = data.cpf ? normalizeCpf(data.cpf) : ""
  const email = data.email?.trim().toLowerCase() || ""
  const phone = (data.phone ?? "").replace(/\D/g, "")
  const notSelf = excludePatientId ? { NOT: { id: excludePatientId } } : {}

  if (cpf.length === 11) {
    const p = await prisma.patient.findFirst({
      where: { clinicId, cpf, ...notSelf },
      select: { id: true, name: true, phone: true, email: true, cpf: true, insurancePlan: true },
    })
    if (p) return { match: toMatch(p), field: "cpf" }
  }

  if (email) {
    const p = await prisma.patient.findFirst({
      where: { clinicId, email, ...notSelf },
      select: { id: true, name: true, phone: true, email: true, cpf: true, insurancePlan: true },
    })
    if (p) return { match: toMatch(p), field: "email" }
  }

  if (phone.length >= 10) {
    const candidates = await prisma.patient.findMany({
      where: { clinicId, ...notSelf },
      select: { id: true, name: true, phone: true, email: true, cpf: true, insurancePlan: true, whatsapp: true },
    })
    const p = candidates.find((row) => {
      const digits = (row.phone ?? "").replace(/\D/g, "")
      const wa = (row.whatsapp ?? "").replace(/\D/g, "")
      return digits === phone || wa === phone
    })
    if (p) return { match: toMatch(p), field: "phone" }
  }

  return null
}

export async function validatePatientCreate(
  data: { name: string; email?: string | null; cpf?: string | null; phone?: string; force?: boolean },
  clinicId: string
) {
  const fields: DuplicateFieldErrors = {}
  const name = data.name.trim()
  const cpf = normalizeCpf(data.cpf || "")
  const phoneDigits = (data.phone ?? "").replace(/\D/g, "")
  const email =
    data.email && String(data.email).trim()
      ? String(data.email).trim().toLowerCase()
      : null

  if (cpf.length !== 11 && phoneDigits.length < 10) {
    fields.cpf = "Informe CPF valido ou telefone com DDD"
    throwIfAny(fields)
  }

  const cpfHit = await findPatientMatch(clinicId, {
    cpf: cpf.length === 11 ? cpf : null,
  })
  if (cpfHit?.field === "cpf") {
    throw new PatientMatchError(cpfHit.match, "cpf", "block")
  }

  if (!data.force) {
    const softHit = await findPatientMatch(clinicId, {
      email,
      phone: phoneDigits,
    })
    if (softHit && (softHit.field === "email" || softHit.field === "phone")) {
      throw new PatientMatchError(softHit.match, softHit.field, "warn")
    }
  }

  return { name, cpf: cpf.length === 11 ? cpf : null, email }
}

export async function validatePatientUpdate(
  patientId: string,
  clinicId: string,
  data: { name?: string; email?: string | null; cpf?: string | null; phone?: string }
) {
  const fields: DuplicateFieldErrors = {}
  const cpf = data.cpf ? normalizeCpf(data.cpf) : ""
  const email = data.email && String(data.email).trim() ? String(data.email).trim().toLowerCase() : null
  const phone = data.phone

  const hit = await findPatientMatch(
    clinicId,
    {
      cpf: cpf.length === 11 ? cpf : null,
    },
    patientId
  )
  if (hit?.field === "cpf") {
    throw new PatientMatchError(hit.match, "cpf", "block")
  }

  throwIfAny(fields)
}
