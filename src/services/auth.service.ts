import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "@/lib/prisma.js"
import { getPermissionsForRole, getRedirectPath } from "@/lib/permissions.js"
import { validateRegisterData } from "@/lib/duplicate-validation.js"
import type { JwtPayload } from "@/types/index.js"
import { JWT_EXPIRES, JWT_SECRET } from "@/lib/env.js"

function generateToken(payload: JwtPayload) {
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: JWT_EXPIRES } as any)
}

/** Usuário adicionado por admin em clínica existente; fundador (cadastro público) não conta. */
async function isProvisionedByClinic(userId: string, clinicId: string) {
  const link = await prisma.userClinic.findFirst({
    where: { userId, clinicId, active: true },
  })
  if (!link) return false

  const memberCount = await prisma.userClinic.count({
    where: { clinicId, active: true },
  })
  if (memberCount === 1) return false
  if (link.isClinicAdmin) return false

  return true
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

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctorProfile: { select: { id: true } } },
  })
  if (!user) return null

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null

  if (!user.active) {
    throw Object.assign(new Error("USER_INACTIVE"), { code: "USER_INACTIVE" })
  }

  const clinics = await loadUserClinics(user.id)
  if (clinics.length === 0) {
    const permissions = getPermissionsForRole(user.role)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      clinicId: "none",
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
      clinicId: null,
      clinics: [],
      permissions,
      redirectPath: "/dashboard",
      needsOnboarding: true,
      provisionedByClinic: false,
    }
  }

  const clinicId = clinics[0].id
  const permissions = getPermissionsForRole(user.role)
  const provisionedByClinic = await isProvisionedByClinic(user.id, clinicId)
  const redirectPath = getRedirectPath(user.role, provisionedByClinic)

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
    clinics,
    permissions,
    redirectPath,
    needsOnboarding: false,
    provisionedByClinic,
  }
}

export async function register(data: {
  name: string
  email: string
  password: string
  cpf: string
  role?: string
}) {
  const normalized = await validateRegisterData({
    name: data.name,
    email: data.email,
    cpf: data.cpf,
  })

  const hashed = await bcrypt.hash(data.password, 10)

  const user = await prisma.user.create({
    data: {
      name: normalized.name,
      email: normalized.email,
      cpf: normalized.cpf,
      password: hashed,
      role: (data.role as any) || "ADMIN",
      active: true,
    },
    include: { doctorProfile: { select: { id: true } } },
  })

  const clinics = await loadUserClinics(user.id)
  const clinicId = clinics[0]?.id ?? ""
  const permissions = getPermissionsForRole(user.role)

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clinicId: clinicId || "none",
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
    clinicId: clinicId || null,
    clinics,
    permissions,
    redirectPath: "/onboarding",
    needsOnboarding: true,
    provisionedByClinic: false,
  }
}

const ROLE_LABEL_MAP: Record<string, "ADMIN" | "DOCTOR" | "RECEPTION"> = {
  Médico: "DOCTOR",
  Recepcionista: "RECEPTION",
  "Administrador(a) da clínica": "ADMIN",
  "Consultor(a) de TI/Negócios": "ADMIN",
  "Outro profissional de saúde": "DOCTOR",
  Paciente: "ADMIN",
}

export async function completeOnboarding(
  userId: string,
  data: {
    roleLabel: string
    teamSize: string
    clinicName?: string
    inviteCode?: string
    crm?: string
    specialty?: string
    phone?: string
  }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("NOT_FOUND")

  const existingLink = await prisma.userClinic.findFirst({
    where: { userId, active: true },
  })
  if (existingLink) {
    const me = await getMe(userId, existingLink.clinicId)
    if (!me) throw new Error("NOT_FOUND")
    const provisionedByClinic = await isProvisionedByClinic(userId, existingLink.clinicId)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: me.role,
      clinicId: existingLink.clinicId,
    })
    return {
      token,
      user: {
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role,
        isAccountAdmin: me.isAccountAdmin,
        doctorId: me.doctorId,
      },
      clinicId: existingLink.clinicId,
      clinicName: me.clinicName,
      clinics: me.clinics,
      permissions: me.permissions,
      redirectPath: getRedirectPath(me.role, provisionedByClinic),
      needsOnboarding: false,
      provisionedByClinic,
    }
  }

  if (data.inviteCode?.trim()) {
    const { joinByInviteCode } = await import("@/services/invite.service.js")
    return joinByInviteCode(userId, data.inviteCode, {
      roleLabel: data.roleLabel,
      crm: data.crm,
      specialty: data.specialty,
      phone: data.phone,
      cpf: user.cpf ?? undefined,
    })
  }

  const mappedRole = ROLE_LABEL_MAP[data.roleLabel] ?? "ADMIN"
  const clinicTitle =
    data.clinicName?.trim() ||
    `Clínica ${user.name.split(" ")[0] || "Nova"}`

  const result = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: { name: clinicTitle, active: true, inviteCode: (await import("@/lib/invite-code.js")).generateInviteCode() },
    })

    await tx.user.update({
      where: { id: userId },
      data: {
        role: mappedRole,
        isAccountAdmin: mappedRole === "ADMIN",
      },
    })

    await tx.userClinic.create({
      data: {
        userId,
        clinicId: clinic.id,
        isClinicAdmin: mappedRole === "ADMIN",
        active: true,
      },
    })

    if (mappedRole === "DOCTOR") {
      const existingDoctor = await tx.doctor.findUnique({ where: { userId } })
      if (!existingDoctor) {
        const suffix = Date.now().toString().slice(-6)
        await tx.doctor.create({
          data: {
            userId,
            name: user.name,
            email: user.email,
            phone: user.phone || "11999999999",
            crm: `CRM${suffix}`,
            specialty: "Clínico Geral",
            professionalType: "Médico",
            hasOwnAgenda: true,
            available: true,
          },
        })
      }
    }

    return clinic.id
  })

  const me = await getMe(userId, result)
  if (!me) throw new Error("NOT_FOUND")
  const permissions = getPermissionsForRole(me.role)
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: me.role,
    clinicId: result,
  })

  return {
    token,
    user: {
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role,
      isAccountAdmin: me.isAccountAdmin,
      doctorId: me.doctorId,
    },
    clinicId: result,
    clinicName: me.clinicName,
    clinics: me.clinics,
    permissions,
    redirectPath: "/dashboard",
    needsOnboarding: false,
    provisionedByClinic: false,
    onboardingMeta: { roleLabel: data.roleLabel, teamSize: data.teamSize },
  }
}

export async function getMe(userId: string, clinicIdFromJwt?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      gender: true,
      phone: true,
      profileImage: true,
      isAccountAdmin: true,
      createdAt: true,
      doctorProfile: { select: { id: true } },
      linkedDoctors: { select: { doctorId: true } },
    },
  })

  if (!user) return null

  const clinics = await loadUserClinics(user.id)
  const jwtClinicValid =
    clinicIdFromJwt &&
    clinicIdFromJwt !== "none" &&
    clinics.some((c) => c.id === clinicIdFromJwt)
  const clinicId = jwtClinicValid ? clinicIdFromJwt : clinics[0]?.id

  const clinic = clinics.find((c) => c.id === clinicId)
  const hasClinic = clinics.length > 0
  const provisionedByClinic =
    hasClinic && clinicId ? await isProvisionedByClinic(user.id, clinicId) : false

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    gender: user.gender,
    phone: user.phone,
    profileImage: user.profileImage,
    isAccountAdmin: user.isAccountAdmin,
    createdAt: user.createdAt,
    doctorId: user.doctorProfile?.id,
    clinicId,
    clinicName: clinic?.name,
    clinics,
    permissions: getPermissionsForRole(user.role),
    linkedDoctorIds:
      user.role === "RECEPTION"
        ? user.linkedDoctors.map((l) => l.doctorId)
        : undefined,
    redirectPath: hasClinic
      ? getRedirectPath(user.role, provisionedByClinic)
      : "/onboarding",
    needsOnboarding: !hasClinic,
    provisionedByClinic,
  }
}

export async function updateMe(
  userId: string,
  clinicIdFromJwt: string | undefined,
  data: {
    name?: string
    email?: string
    phone?: string
    gender?: "M" | "F" | "O"
    password?: string
    currentPassword?: string
  }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      doctorProfile: { select: { id: true } },
    },
  })

  if (!user) {
    throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" })
  }

  if (data.name !== undefined || data.email !== undefined) {
    const { validateUserUpdate } = await import("@/lib/duplicate-validation.js")
    await validateUserUpdate(userId, {
      name: data.name ?? user.name,
      email: data.email ?? user.email,
    })
  }

  if (data.password) {
    if (!data.currentPassword) {
      throw Object.assign(new Error("Senha atual obrigatoria"), {
        code: "CURRENT_PASSWORD_REQUIRED",
      })
    }
    const valid = await bcrypt.compare(data.currentPassword, user.password)
    if (!valid) {
      throw Object.assign(new Error("Senha atual incorreta"), {
        code: "INVALID_CURRENT_PASSWORD",
      })
    }
    const { validatePassword } = await import("@/lib/password.js")
    const pwdError = validatePassword(data.password)
    if (pwdError) {
      throw Object.assign(new Error(pwdError), { code: "INVALID_PASSWORD" })
    }
  }

  const userUpdate: {
    name?: string
    email?: string
    phone?: string | null
    gender?: "M" | "F" | "O"
    password?: string
  } = {}

  if (data.name !== undefined) userUpdate.name = data.name.trim()
  if (data.email !== undefined) userUpdate.email = data.email.trim().toLowerCase()
  if (data.phone !== undefined) userUpdate.phone = data.phone.trim() || null
  if (data.gender !== undefined) userUpdate.gender = data.gender
  if (data.password) userUpdate.password = await bcrypt.hash(data.password, 10)

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userUpdate })
    }

    if (user.doctorProfile && (data.name !== undefined || data.email !== undefined)) {
      await tx.doctor.update({
        where: { id: user.doctorProfile.id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
        },
      })
    }
  })

  return getMe(userId, clinicIdFromJwt)
}
