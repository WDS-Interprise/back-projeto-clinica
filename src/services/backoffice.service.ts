import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "@/lib/prisma.js"
import type { JwtPayload } from "@/types/index.js"
import { startOfDay, endOfDay } from "date-fns"
import { JWT_EXPIRES, JWT_SECRET } from "@/lib/env.js"

function generateToken(payload: JwtPayload) {
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: JWT_EXPIRES } as object)
}

async function defaultClinicIdForUser(userId: string) {
  const link = await prisma.userClinic.findFirst({
    where: { userId, active: true },
    select: { clinicId: true },
  })
  return link?.clinicId ?? "clinic-default"
}

export async function adminLogin(email: string, password: string) {
  const envEmail = process.env.ADMIN_EMAIL
  const envPassword = process.env.ADMIN_PASSWORD

  if (envEmail && envPassword && email === envEmail && password === envPassword) {
    let user = await prisma.user.findUnique({ where: { email: envEmail } })
    if (!user) {
      const hashed = await bcrypt.hash(envPassword, 10)
      user = await prisma.user.create({
        data: {
          name: "Administrador",
          email: envEmail,
          password: hashed,
          role: "ADMIN",
          isAccountAdmin: true,
        },
      })
    } else if (user.role !== "ADMIN") {
      return null
    }

    const clinicId = await defaultClinicIdForUser(user.id)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      clinicId,
      isPlatformOwner: true,
    })

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPlatformOwner: true,
      },
    }
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isAccountAdmin) return null

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null

  const clinicId = await defaultClinicIdForUser(user.id)
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    clinicId,
    isPlatformOwner: true,
  })

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isPlatformOwner: true,
    },
  }
}

export async function assertPlatformOwner(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAccountAdmin: true, email: true },
  })
  if (!user) return false
  const envEmail = process.env.ADMIN_EMAIL
  if (envEmail && user.email === envEmail) return true
  return user.isAccountAdmin
}

export async function getMetrics() {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const [totalPatients, totalAppointments, appointmentsToday, totalDoctors, totalRecords, totalUsers, usersByRole, upcoming, recentPatients] =
    await Promise.all([
      prisma.patient.count(),
      prisma.appointment.count({ where: { type: "SCHEDULE" } }),
      prisma.appointment.count({
        where: { date: { gte: todayStart, lte: todayEnd }, type: "SCHEDULE" },
      }),
      prisma.doctor.count(),
      prisma.medicalRecord.count(),
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
      prisma.appointment.findMany({
        where: {
          date: { gte: todayStart },
          status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] },
          type: "SCHEDULE",
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 10,
        include: {
          patient: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true, specialty: true } },
        },
      }),
      prisma.patient.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, phone: true, createdAt: true, insurancePlan: true },
      }),
    ])

  const appointmentsByStatus = await prisma.appointment.groupBy({
    by: ["status"],
    _count: { status: true },
  })

  return {
    overview: {
      totalPatients,
      totalAppointments,
      appointmentsToday,
      doctorsAvailable: totalDoctors,
      totalDoctors,
      totalRecords,
      totalUsers,
    },
    usersByRole: usersByRole.map((r) => ({
      role: r.role,
      count: r._count.role,
    })),
    appointmentsByStatus: appointmentsByStatus.map((a) => ({
      status: a.status,
      count: a._count.status,
    })),
    upcomingAppointments: upcoming.map((a) => ({ ...a, time: a.startTime })),
    recentPatients,
    generatedAt: new Date().toISOString(),
  }
}

export async function listClinics() {
  return prisma.clinic.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          patients: true,
          appointments: true,
        },
      },
    },
  })
}

export async function createClinic(data: {
  name: string
  phone?: string
  email?: string
  active?: boolean
}) {
  return prisma.clinic.create({
    data: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      active: data.active ?? true,
    },
  })
}

export async function updateClinic(
  id: string,
  data: Partial<{ name: string; phone: string; email: string; active: boolean }>
) {
  return prisma.clinic.update({ where: { id }, data })
}

export async function listUsers(params: {
  role?: string
  clinicId?: string
  search?: string
  /** Por padrão só usuários ativos (excluídos/desativados não aparecem). */
  includeInactive?: boolean
}) {
  const where: Record<string, unknown> = {}
  if (!params.includeInactive) where.active = true
  if (params.role) where.role = params.role
  if (params.clinicId) {
    where.clinics = { some: { clinicId: params.clinicId, active: true } }
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { email: { contains: params.search } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      isAccountAdmin: true,
      phone: true,
      createdAt: true,
      doctorProfile: { select: { id: true, specialty: true, crm: true } },
      clinics: {
        where: { active: true },
        select: {
          isClinicAdmin: true,
          clinic: { select: { id: true, name: true } },
        },
      },
    },
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    isAccountAdmin: u.isAccountAdmin,
    phone: u.phone,
    createdAt: u.createdAt,
    doctorProfile: u.doctorProfile,
    clinics: u.clinics.map((c) => ({
      id: c.clinic.id,
      name: c.clinic.name,
      isClinicAdmin: c.isClinicAdmin,
    })),
  }))
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      isAccountAdmin: true,
      gender: true,
      phone: true,
      doctorProfile: true,
      clinics: {
        select: {
          clinicId: true,
          isClinicAdmin: true,
          active: true,
          clinic: { select: { id: true, name: true } },
        },
      },
      linkedDoctors: {
        select: { doctorId: true, doctor: { select: { id: true, name: true } } },
      },
    },
  })
  if (!user) return null
  return {
    ...user,
    linkedDoctors: user.linkedDoctors.map((l) => l.doctor),
    clinicIds: user.clinics.filter((c) => c.active).map((c) => c.clinicId),
  }
}

export async function createPlatformUser(data: {
  role: "RECEPTION" | "DOCTOR" | "ADMIN"
  name: string
  email: string
  password: string
  clinicId: string
  phone?: string
  gender?: "M" | "F" | "O"
  isAccountAdmin?: boolean
  isClinicAdmin?: boolean
  linkedDoctorIds?: string[]
  crm?: string
  specialty?: string
  cpf?: string
}) {
  const { validatePassword } = await import("@/lib/password.js")
  const pwdError = validatePassword(data.password)
  if (pwdError) throw Object.assign(new Error(pwdError), { code: "INVALID_PASSWORD" })

  const { validateUserCreate } = await import("@/lib/duplicate-validation.js")
  const normalized = await validateUserCreate({
    name: data.name,
    email: data.email,
    cpf: data.role === "DOCTOR" ? data.cpf : undefined,
  })

  const clinic = await prisma.clinic.findUnique({ where: { id: data.clinicId } })
  if (!clinic) throw new Error("CLINIC_NOT_FOUND")

  const hashed = await bcrypt.hash(data.password, 10)

  if (data.role === "ADMIN") {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: normalized.name,
          email: normalized.email,
          password: hashed,
          role: "ADMIN",
          phone: data.phone,
          gender: data.gender,
          isAccountAdmin: data.isAccountAdmin ?? false,
          active: true,
        },
      })
      await tx.userClinic.create({
        data: {
          userId: user.id,
          clinicId: data.clinicId,
          isClinicAdmin: true,
          active: true,
        },
      })
      return getUserById(user.id)
    })
  }

  if (data.role === "RECEPTION") {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: normalized.name,
          email: normalized.email,
          password: hashed,
          role: "RECEPTION",
          phone: data.phone,
          gender: data.gender,
          isAccountAdmin: false,
          active: true,
        },
      })
      await tx.userClinic.create({
        data: {
          userId: user.id,
          clinicId: data.clinicId,
          isClinicAdmin: data.isClinicAdmin ?? false,
          active: true,
        },
      })
      if (data.linkedDoctorIds?.length) {
        await tx.receptionistDoctor.createMany({
          data: data.linkedDoctorIds.map((doctorId) => ({
            receptionistId: user.id,
            doctorId,
          })),
        })
      }
      return getUserById(user.id)
    })
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: normalized.name,
        email: normalized.email,
        cpf: normalized.cpf,
        password: hashed,
        role: "DOCTOR",
        phone: data.phone ?? "",
        gender: data.gender,
        active: true,
      },
    })
    await tx.doctor.create({
      data: {
        userId: user.id,
        name: normalized.name,
        email: normalized.email,
        phone: data.phone ?? "",
        cpf: normalized.cpf,
        crm: data.crm ?? "000000",
        specialty: data.specialty ?? "Clínico Geral",
        professionalType: "Médico",
        hasOwnAgenda: true,
        available: true,
      },
    })
    await tx.userClinic.create({
      data: {
        userId: user.id,
        clinicId: data.clinicId,
        isClinicAdmin: data.isClinicAdmin ?? false,
        active: true,
      },
    })
    return getUserById(user.id)
  })
}

export async function updatePlatformUser(
  id: string,
  data: Partial<{
    name: string
    email: string
    password: string
    active: boolean
    isAccountAdmin: boolean
    isClinicAdmin: boolean
    clinicId: string
    phone: string
    linkedDoctorIds: string[]
    crm: string
    specialty: string
  }>
) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return null

  const { validateUserUpdate } = await import("@/lib/duplicate-validation.js")
  await validateUserUpdate(id, { name: data.name, email: data.email })

  if (data.password) {
    const { validatePassword } = await import("@/lib/password.js")
    const pwdError = validatePassword(data.password)
    if (pwdError) throw Object.assign(new Error(pwdError), { code: "INVALID_PASSWORD" })
  }

  const userUpdate: Record<string, unknown> = {}
  if (data.name !== undefined) userUpdate.name = data.name
  if (data.email !== undefined) userUpdate.email = data.email
  if (data.active !== undefined) userUpdate.active = data.active
  if (data.phone !== undefined) userUpdate.phone = data.phone
  if (data.isAccountAdmin !== undefined) userUpdate.isAccountAdmin = data.isAccountAdmin
  if (data.password) userUpdate.password = await bcrypt.hash(data.password, 10)

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdate).length) {
      await tx.user.update({ where: { id }, data: userUpdate })
    }
    if (data.clinicId !== undefined) {
      await tx.userClinic.updateMany({
        where: { userId: id },
        data: { active: false },
      })
      await tx.userClinic.upsert({
        where: { userId_clinicId: { userId: id, clinicId: data.clinicId } },
        update: { active: true, isClinicAdmin: data.isClinicAdmin ?? false },
        create: {
          userId: id,
          clinicId: data.clinicId,
          isClinicAdmin: data.isClinicAdmin ?? false,
          active: true,
        },
      })
    } else if (data.isClinicAdmin !== undefined) {
      await tx.userClinic.updateMany({
        where: { userId: id, active: true },
        data: { isClinicAdmin: data.isClinicAdmin },
      })
    }
    const current = await tx.user.findUnique({
      where: { id },
      include: { doctorProfile: true },
    })
    if (current?.role === "RECEPTION" && data.linkedDoctorIds) {
      await tx.receptionistDoctor.deleteMany({ where: { receptionistId: id } })
      if (data.linkedDoctorIds.length) {
        await tx.receptionistDoctor.createMany({
          data: data.linkedDoctorIds.map((doctorId) => ({
            receptionistId: id,
            doctorId,
          })),
        })
      }
    }
    if (current?.doctorProfile && (data.crm !== undefined || data.specialty !== undefined)) {
      await tx.doctor.update({
        where: { id: current.doctorProfile.id },
        data: {
          ...(data.crm !== undefined ? { crm: data.crm } : {}),
          ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
        },
      })
    }
  })

  return getUserById(id)
}

export async function removePlatformUser(id: string, actingUserId?: string) {
  if (actingUserId && id === actingUserId) {
    throw new Error("CANNOT_DELETE_SELF")
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new Error("NOT_FOUND")

  if (user.isAccountAdmin) {
    const owners = await prisma.user.count({
      where: { isAccountAdmin: true, active: true },
    })
    if (owners <= 1) throw new Error("LAST_OWNER")
  }

  await prisma.$transaction(async (tx) => {
    await tx.userClinic.updateMany({
      where: { userId: id },
      data: { active: false },
    })
    await tx.user.update({
      where: { id },
      data: { active: false },
    })
  })
}

export async function listPatients(params: {
  clinicId?: string
  search?: string
  page?: number
  limit?: number
}) {
  const page = params.page ?? 1
  const limit = Math.min(params.limit ?? 20, 100)
  const skip = (page - 1) * limit
  const where: Record<string, unknown> = {}
  if (params.clinicId) where.clinicId = params.clinicId
  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { phone: { contains: params.search } },
      { email: { contains: params.search } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        insurancePlan: true,
        createdAt: true,
        clinicId: true,
        clinic: { select: { id: true, name: true } },
      },
    }),
    prisma.patient.count({ where }),
  ])

  return { data, total, page, totalPages: Math.ceil(total / limit) }
}
