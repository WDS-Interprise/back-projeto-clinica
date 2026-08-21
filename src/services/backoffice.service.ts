import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "@/lib/prisma.js"
import type { JwtPayload } from "@/types/index.js"
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { JWT_EXPIRES, JWT_SECRET } from "@/lib/env.js"
import { moneyFromUnknown } from "@/lib/money.js"
import { getBillingSummary } from "@/services/subscription.service.js"

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "Agora"
  if (mins < 60) return `Há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Há ${days}d`
  return date.toLocaleDateString("pt-BR")
}

function monthLabel(date: Date) {
  return MONTH_LABELS[date.getMonth()] ?? "?"
}

async function countCreatedInRange(model: "clinic" | "patient" | "user", start: Date, end: Date) {
  const where = { createdAt: { gte: start, lte: end } }
  if (model === "clinic") return prisma.clinic.count({ where })
  if (model === "patient") return prisma.patient.count({ where })
  return prisma.user.count({ where })
}

async function buildMonthlyTrend(months: number, counter: (start: Date, end: Date) => Promise<number>) {
  const now = new Date()
  const points: Array<{ month: string; value: number }> = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const ref = subMonths(now, i)
    const start = startOfMonth(ref)
    const end = endOfMonth(ref)
    points.push({ month: monthLabel(ref), value: await counter(start, end) })
  }
  return points
}

function percentOf(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

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
    } else {
      if (user.role !== "ADMIN") return null
      const hashed = await bcrypt.hash(envPassword, 10)
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          active: true,
          isAccountAdmin: true,
        },
      })
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

  const [
    totalPatients,
    totalAppointments,
    appointmentsToday,
    totalDoctors,
    totalRecords,
    totalUsers,
    usersByRole,
    upcoming,
    recentPatients,
    totalClinics,
    activeClinics,
    whatsappConnections,
    inactiveClinics,
    clinicsWithWhatsapp,
    pendingJoinRequests,
    pendingInvites,
    recentClinics,
    recentClinicEvents,
    recentPatientEvents,
    recentUserEvents,
    pendingJoinRequestEvents,
    recentPaymentEvents,
    activeClinicsList,
    paymentsByStatus,
    platformPaymentsReceived,
  ] = await Promise.all([
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
      prisma.clinic.count(),
      prisma.clinic.count({ where: { active: true } }),
      prisma.whatsappConnection.count({ where: { status: "CONNECTED" } }),
      prisma.clinic.count({ where: { active: false } }),
      prisma.clinic.count({
        where: { whatsappConnections: { some: { status: "CONNECTED" } } },
      }),
      prisma.clinicJoinRequest.count({ where: { status: "PENDING" } }),
      prisma.clinicInvite.count({ where: { status: "PENDING" } }),
      prisma.clinic.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          _count: { select: { users: true, patients: true, appointments: true } },
          whatsappConnections: {
            where: { status: "CONNECTED" },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.clinic.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { name: true, createdAt: true },
      }),
      prisma.patient.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { name: true, createdAt: true, clinic: { select: { name: true } } },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { name: true, createdAt: true, role: true },
      }),
      prisma.clinicJoinRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: {
          user: { select: { name: true } },
          clinic: { select: { name: true } },
        },
      }),
      prisma.platformPayment.findMany({
        where: { status: { in: ["CONFIRMED", "RECEIVED"] } },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: {
          platformFee: true,
          createdAt: true,
          clinic: { select: { name: true } },
        },
      }),
      prisma.clinic.findMany({
        where: { active: true },
        select: { teamSizeLabel: true },
      }),
      prisma.platformPayment.groupBy({
        by: ["status"],
        _count: { status: true },
        _sum: { platformFee: true },
      }),
      prisma.platformPayment.findMany({
        where: { status: { in: ["CONFIRMED", "RECEIVED"] } },
        select: { platformFee: true, createdAt: true, receivedAt: true },
      }),
    ])

  const appointmentsByStatus = await prisma.appointment.groupBy({
    by: ["status"],
    _count: { status: true },
  })

  const offlineIntegrations = Math.max(0, totalClinics - clinicsWithWhatsapp)

  const recentClinicsTable = recentClinics.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.active ? "Ativa" : "Inativa",
    users: c._count.users,
    patients: c._count.patients,
    appointments: c._count.appointments,
    whatsapp: c.whatsappConnections.length > 0 ? "Conectado" : "Offline",
    createdAt: c.createdAt.toISOString(),
  }))

  const teamSizeCounts = new Map<string, number>()
  for (const clinic of activeClinicsList) {
    const label = clinic.teamSizeLabel?.trim() || "Não informado"
    teamSizeCounts.set(label, (teamSizeCounts.get(label) ?? 0) + 1)
  }
  const clinicDistribution = [...teamSizeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percent: percentOf(count, activeClinics),
    }))

  const [clinicsGrowthTrend, patientsGrowthTrend, payRevenueTrend, subscriptionRevenueTrend, joinRequestsTrend, whatsappTrendValues] =
    await Promise.all([
    buildMonthlyTrend(6, (start, end) => countCreatedInRange("clinic", start, end)),
    buildMonthlyTrend(6, (start, end) => countCreatedInRange("patient", start, end)),
    buildMonthlyTrend(6, async (start, end) => {
      const payments = await prisma.platformPayment.findMany({
        where: {
          status: { in: ["CONFIRMED", "RECEIVED"] },
          OR: [
            { receivedAt: { gte: start, lte: end } },
            { receivedAt: null, createdAt: { gte: start, lte: end } },
          ],
        },
        select: { platformFee: true },
      })
      return payments.reduce((sum, payment) => sum + moneyFromUnknown(payment.platformFee), 0)
    }),
    buildMonthlyTrend(6, async (start, end) => {
      const invoices = await prisma.subscriptionInvoice.findMany({
        where: {
          status: "PAID",
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true },
      })
      return invoices.reduce((sum, inv) => sum + moneyFromUnknown(inv.amount), 0)
    }),
    buildMonthlyTrend(6, async (start, end) =>
      prisma.clinicJoinRequest.count({ where: { createdAt: { gte: start, lte: end } } })
    ),
    buildMonthlyTrend(6, async (start, end) =>
      prisma.whatsappConnection.count({
        where: { status: "CONNECTED", lastConnectedAt: { gte: start, lte: end } },
      })
    ),
  ])

  const usersTrendValues = await buildMonthlyTrend(6, (start, end) => countCreatedInRange("user", start, end))

  const platformRevenueTotal = platformPaymentsReceived.reduce(
    (sum, payment) => sum + moneyFromUnknown(payment.platformFee),
    0
  )
  const monthStart = startOfMonth(new Date())
  const monthEnd = endOfMonth(new Date())
  const platformRevenueMonth = platformPaymentsReceived
    .filter((payment) => {
      const ref = payment.receivedAt ?? payment.createdAt
      return ref >= monthStart && ref <= monthEnd
    })
    .reduce((sum, payment) => sum + moneyFromUnknown(payment.platformFee), 0)

  const paymentStatusLabels: Record<string, string> = {
    PENDING: "Pendentes",
    CONFIRMED: "Confirmados",
    RECEIVED: "Recebidos",
    REFUNDED: "Estornados",
    CANCELLED: "Cancelados",
    FAILED: "Falhos",
  }
  const paymentStatusTotal = paymentsByStatus.reduce((sum, row) => sum + row._count.status, 0)
  const paymentStatusDistribution = paymentsByStatus
    .map((row) => ({
      name: paymentStatusLabels[row.status] ?? row.status,
      count: row._count.status,
      percent: percentOf(row._count.status, paymentStatusTotal),
      value: moneyFromUnknown(row._sum.platformFee),
    }))
    .sort((a, b) => b.count - a.count)

  const platformActivities = [
    ...recentClinicEvents.map((c) => ({
      text: "Nova clínica cadastrada",
      detail: c.name,
      time: formatRelativeTime(c.createdAt),
      at: c.createdAt,
    })),
    ...recentPatientEvents.map((p) => ({
      text: "Novo paciente cadastrado",
      detail: `${p.name}${p.clinic?.name ? ` · ${p.clinic.name}` : ""}`,
      time: formatRelativeTime(p.createdAt),
      at: p.createdAt,
    })),
    ...recentUserEvents.map((u) => ({
      text: "Novo usuário na plataforma",
      detail: `${u.name} · ${u.role}`,
      time: formatRelativeTime(u.createdAt),
      at: u.createdAt,
    })),
    ...pendingJoinRequestEvents.map((r) => ({
      text: "Solicitação de acesso pendente",
      detail: `${r.user.name} · ${r.clinic.name}`,
      time: formatRelativeTime(r.createdAt),
      at: r.createdAt,
    })),
    ...recentPaymentEvents.map((p) => ({
      text: "Pagamento ClinMax Pay recebido",
      detail: `${p.clinic.name} · ${moneyFromUnknown(p.platformFee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      time: formatRelativeTime(p.createdAt),
      at: p.createdAt,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)
    .map(({ text, detail, time }) => ({ text, detail, time }))

  const subscriptionBilling = await getBillingSummary()

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
    saas: {
      activeClinics,
      totalClinics,
      inactiveClinics,
      whatsappConnected: whatsappConnections,
      clinicsWithWhatsapp,
      offlineIntegrations,
      pendingJoinRequests,
      pendingInvites,
      platformRevenueTotal,
      platformRevenueMonth,
      subscriptionMrr: subscriptionBilling.mrr,
      subscriptionArr: subscriptionBilling.arr,
      subscriptionRevenueMonth: subscriptionBilling.revenueMonth,
      subscriptionReceivable: subscriptionBilling.receivable,
      subscriptionOverdue: subscriptionBilling.overdue,
      trialSubscriptions: subscriptionBilling.trialSubscriptions,
      pastDueSubscriptions: subscriptionBilling.pastDueSubscriptions,
      activeSubscriptions: subscriptionBilling.activeSubscriptions,
      clinicsGrowthTrend,
      patientsGrowthTrend,
      revenueTrend: payRevenueTrend,
      subscriptionRevenueTrend,
      clinicDistribution,
      recentClinics: recentClinicsTable,
      platformActivities,
      paymentStatusDistribution,
      kpiTrends: {
        activeClinics: clinicsGrowthTrend.map((point) => point.value),
        patients: patientsGrowthTrend.map((point) => point.value),
        users: usersTrendValues.map((point) => point.value),
        whatsappConnected: whatsappTrendValues.map((point) => point.value),
        joinRequests: joinRequestsTrend.map((point) => point.value),
      },
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
  const rows = await prisma.clinic.findMany({
    orderBy: { name: "asc" },
    include: {
      subscription: { include: { plan: { select: { id: true, name: true, slug: true } } } },
      _count: {
        select: {
          users: true,
          patients: true,
          appointments: true,
        },
      },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    active: c.active,
    _count: c._count,
    subscription: c.subscription
      ? {
          planId: c.subscription.planId,
          planName: c.subscription.plan.name,
          planSlug: c.subscription.plan.slug,
          status: c.subscription.status,
        }
      : null,
  }))
}

export async function createClinic(data: {
  name: string
  phone?: string
  email?: string
  active?: boolean
}) {
  const clinic = await prisma.clinic.create({
    data: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      active: data.active ?? true,
    },
  })
  const { ensureClinicSubscription } = await import("@/lib/saas-billing-seed.js")
  await ensureClinicSubscription(clinic.id)
  return clinic
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
