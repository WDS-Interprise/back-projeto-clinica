import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { addDays } from "date-fns"
import type { Gender, Role } from "@prisma/client"

import prisma from "@/lib/prisma.js"
import { generateInviteCode, generateInviteToken, normalizeInviteCode } from "@/lib/invite-code.js"
import { FRONTEND_URL, JWT_EXPIRES, JWT_SECRET } from "@/lib/env.js"
import { getPermissionsForRole, getRedirectPath } from "@/lib/permissions.js"
import { validatePassword } from "@/lib/password.js"
import { validateRegisterData, validateUserCreate } from "@/lib/duplicate-validation.js"
import { sendClinicInviteEmail } from "@/services/mail.service.js"
import type { JwtPayload } from "@/types/index.js"

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador(a)",
  DOCTOR: "Médico(a)",
  RECEPTION: "Recepcionista",
}

const ROLE_LABEL_MAP: Record<string, Role> = {
  Médico: "DOCTOR",
  Recepcionista: "RECEPTION",
  "Administrador(a) da clínica": "ADMIN",
  "Consultor(a) de TI/Negócios": "ADMIN",
  "Outro profissional de saúde": "DOCTOR",
  Paciente: "ADMIN",
}

function generateToken(payload: JwtPayload) {
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: JWT_EXPIRES } as any)
}

async function loadUserClinics(userId: string) {
  const links = await prisma.userClinic.findMany({
    where: { userId, active: true, clinic: { active: true } },
    include: { clinic: { select: { id: true, name: true } } },
  })
  return links.map((l) => ({
    id: l.clinic.id,
    name: l.clinic.name,
    isClinicAdmin: l.isClinicAdmin,
  }))
}

async function isProvisionedByClinic(userId: string, clinicId: string) {
  const link = await prisma.userClinic.findFirst({
    where: { userId, clinicId, active: true },
  })
  if (!link) return false
  const memberCount = await prisma.userClinic.count({ where: { clinicId, active: true } })
  if (memberCount === 1) return false
  if (link.isClinicAdmin) return false
  return true
}

async function buildAuthSession(userId: string, clinicId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { doctorProfile: { select: { id: true } } },
  })
  if (!user) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })

  const clinics = await loadUserClinics(userId)
  const clinic = clinics.find((c) => c.id === clinicId)
  const permissions = getPermissionsForRole(user.role)
  const provisionedByClinic = await isProvisionedByClinic(userId, clinicId)

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clinicId,
  })

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isAccountAdmin: user.isAccountAdmin,
      doctorId: user.doctorProfile?.id,
    },
    clinicId,
    clinicName: clinic?.name,
    clinics,
    permissions,
    redirectPath: getRedirectPath(user.role, provisionedByClinic),
    needsOnboarding: false,
    provisionedByClinic,
  }
}

export async function ensureClinicInviteCode(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } })
  if (!clinic) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })
  if (clinic.inviteCode) return clinic.inviteCode

  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode()
    try {
      const updated = await prisma.clinic.update({
        where: { id: clinicId },
        data: { inviteCode },
      })
      return updated.inviteCode!
    } catch {
      // collision — retry
    }
  }

  throw Object.assign(new Error("INVITE_CODE_FAILED"), { code: "INVITE_CODE_FAILED" })
}

export async function getClinicInviteOverview(clinicId: string) {
  const inviteCode = await ensureClinicInviteCode(clinicId)
  const invites = await prisma.clinicInvite.findMany({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
    include: {
      invitedBy: { select: { id: true, name: true, email: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  })

  return {
    inviteCode,
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role],
      status: invite.status,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      createdAt: invite.createdAt,
      invitedBy: invite.invitedBy,
      acceptedBy: invite.acceptedBy,
    })),
  }
}

export async function createEmailInvite(
  clinicId: string,
  invitedById: string,
  data: { email: string; role: Role }
) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } })
  if (!clinic) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })

  const inviteCode = await ensureClinicInviteCode(clinicId)
  const email = data.email.trim().toLowerCase()
  const invitedBy = await prisma.user.findUnique({ where: { id: invitedById } })
  if (!invitedBy) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    const alreadyLinked = await prisma.userClinic.findFirst({
      where: { userId: existingUser.id, clinicId, active: true },
    })
    if (alreadyLinked) {
      throw Object.assign(new Error("Usuário já participa desta clínica"), {
        code: "ALREADY_MEMBER",
      })
    }
  }

  const pending = await prisma.clinicInvite.findFirst({
    where: { clinicId, email, status: "PENDING", expiresAt: { gt: new Date() } },
  })
  if (pending) {
    throw Object.assign(new Error("Já existe um convite pendente para este e-mail"), {
      code: "INVITE_PENDING",
    })
  }

  const token = generateInviteToken()
  const invite = await prisma.clinicInvite.create({
    data: {
      clinicId,
      email,
      role: data.role,
      token,
      invitedById,
      expiresAt: addDays(new Date(), 7),
    },
  })

  const inviteUrl = `${FRONTEND_URL.replace(/\/$/, "")}/convite/${token}`
  const mailResult = await sendClinicInviteEmail({
    to: email,
    clinicName: clinic.name,
    roleLabel: ROLE_LABELS[data.role],
    inviteUrl,
    inviteCode,
    invitedByName: invitedBy.name,
  })

  return {
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role],
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    },
    inviteUrl,
    inviteCode,
    emailDelivered: mailResult.delivered,
    emailPreview: "preview" in mailResult ? mailResult.preview : undefined,
  }
}

export async function revokeInvite(clinicId: string, inviteId: string) {
  const invite = await prisma.clinicInvite.findFirst({
    where: { id: inviteId, clinicId, status: "PENDING" },
  })
  if (!invite) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })

  return prisma.clinicInvite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  })
}

export async function regenerateInviteCode(clinicId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode()
    try {
      return await prisma.clinic.update({
        where: { id: clinicId },
        data: { inviteCode },
        select: { inviteCode: true },
      })
    } catch {
      // collision — retry
    }
  }
  throw Object.assign(new Error("INVITE_CODE_FAILED"), { code: "INVITE_CODE_FAILED" })
}

export async function previewInviteToken(token: string) {
  const invite = await prisma.clinicInvite.findUnique({
    where: { token },
    include: { clinic: { select: { id: true, name: true } } },
  })
  if (!invite) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })

  const expired = invite.expiresAt < new Date()
  const status =
    invite.status === "PENDING" && expired ? "EXPIRED" : invite.status

  return {
    clinicId: invite.clinicId,
    clinicName: invite.clinic.name,
    email: invite.email,
    role: invite.role,
    roleLabel: ROLE_LABELS[invite.role],
    status,
    expiresAt: invite.expiresAt,
    canAccept: status === "PENDING",
  }
}

type JoinProfile = {
  roleLabel?: string
  crm?: string
  specialty?: string
  phone?: string
  cpf?: string
}

async function linkUserToClinic(
  userId: string,
  clinicId: string,
  role: Role,
  profile?: JoinProfile
) {
  const existingLink = await prisma.userClinic.findFirst({
    where: { userId, clinicId, active: true },
  })
  if (existingLink) {
    throw Object.assign(new Error("Usuário já participa desta clínica"), {
      code: "ALREADY_MEMBER",
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { role },
    })

    await tx.userClinic.create({
      data: {
        userId,
        clinicId,
        isClinicAdmin: role === "ADMIN",
        active: true,
      },
    })

    if (role === "DOCTOR") {
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) return

      const existingDoctor = await tx.doctor.findUnique({ where: { userId } })
      const crm = profile?.crm?.trim() || `CRM${Date.now().toString().slice(-6)}`
      const specialty = profile?.specialty?.trim() || "Clínico Geral"

      if (existingDoctor) {
        await tx.doctor.update({
          where: { id: existingDoctor.id },
          data: {
            name: user.name,
            email: user.email,
            phone: profile?.phone?.trim() || user.phone || "11999999999",
            crm,
            specialty,
            available: true,
            hasOwnAgenda: true,
          },
        })
      } else {
        await tx.doctor.create({
          data: {
            userId,
            name: user.name,
            email: user.email,
            phone: profile?.phone?.trim() || user.phone || "11999999999",
            cpf: profile?.cpf,
            crm,
            specialty,
            professionalType: "Médico",
            hasOwnAgenda: true,
            available: true,
          },
        })
      }
    }
  })
}

export async function joinByInviteCode(userId: string, rawCode: string, profile?: JoinProfile) {
  const inviteCode = normalizeInviteCode(rawCode)
  if (!inviteCode) {
    throw Object.assign(new Error("Código inválido"), { code: "INVALID_CODE" })
  }

  const clinic = await prisma.clinic.findFirst({
    where: { inviteCode, active: true },
  })
  if (!clinic) {
    throw Object.assign(new Error("Código de clínica não encontrado"), { code: "INVALID_CODE" })
  }

  const role = profile?.roleLabel ? ROLE_LABEL_MAP[profile.roleLabel] ?? "DOCTOR" : "DOCTOR"
  if (role === "DOCTOR" && !profile?.crm?.trim()) {
    throw Object.assign(new Error("Informe o CRM para entrar como médico"), {
      code: "CRM_REQUIRED",
    })
  }

  await linkUserToClinic(userId, clinic.id, role, profile)
  return buildAuthSession(userId, clinic.id)
}

export async function acceptInviteToken(
  token: string,
  data: {
    name: string
    password: string
    cpf?: string
    crm?: string
    specialty?: string
    phone?: string
  },
  existingUserId?: string
) {
  const invite = await prisma.clinicInvite.findUnique({
    where: { token },
    include: { clinic: { select: { id: true, name: true, active: true } } },
  })

  if (!invite || invite.status !== "PENDING") {
    throw Object.assign(new Error("Convite inválido ou já utilizado"), { code: "INVALID_INVITE" })
  }
  if (invite.expiresAt < new Date()) {
    await prisma.clinicInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    })
    throw Object.assign(new Error("Convite expirado"), { code: "INVITE_EXPIRED" })
  }
  if (!invite.clinic.active) {
    throw Object.assign(new Error("Clínica inativa"), { code: "CLINIC_INACTIVE" })
  }

  if (invite.role === "DOCTOR" && !data.crm?.trim()) {
    throw Object.assign(new Error("Informe o CRM"), { code: "CRM_REQUIRED" })
  }

  let userId = existingUserId

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw Object.assign(new Error("Este convite pertence a outro e-mail"), {
        code: "EMAIL_MISMATCH",
      })
    }
  } else {
    const pwdError = validatePassword(data.password || "")
    if (!data.password || pwdError) {
      throw Object.assign(new Error(pwdError || "Senha obrigatória"), {
        code: "INVALID_PASSWORD",
      })
    }

    const normalized = await validateRegisterData({
      name: data.name,
      email: invite.email,
      cpf: data.cpf?.replace(/\D/g, "") || String(Date.now()).slice(-11),
    })

    const hashed = await bcrypt.hash(data.password, 10)
    const user = await prisma.user.create({
      data: {
        name: normalized.name,
        email: normalized.email,
        cpf: normalized.cpf,
        password: hashed,
        role: invite.role,
        phone: data.phone?.trim() || null,
        active: true,
      },
    })
    userId = user.id
  }

  await linkUserToClinic(userId!, invite.clinicId, invite.role, {
    crm: data.crm,
    specialty: data.specialty,
    phone: data.phone,
    cpf: data.cpf,
  })

  await prisma.clinicInvite.update({
    where: { id: invite.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedById: userId,
    },
  })

  return buildAuthSession(userId!, invite.clinicId)
}

export { ROLE_LABEL_MAP }
