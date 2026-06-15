import prisma from "@/lib/prisma.js"
import { startOfDay, endOfDay, subDays } from "date-fns"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

function clinicWhere(ctx: AuthContext) {
  return { clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m ?? 0)
}

export async function getStats(ctx: AuthContext) {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())
  const base = clinicWhere(ctx)

  const [totalPatients, totalAppointments, appointmentsToday, doctorsAvailable] =
    await Promise.all([
      prisma.patient.count({ where: { clinicId: ctx.clinicId } }),
      prisma.appointment.count({ where: { ...base, type: "SCHEDULE" } }),
      prisma.appointment.count({
        where: {
          ...base,
          date: { gte: todayStart, lte: todayEnd },
          type: "SCHEDULE",
        },
      }),
      prisma.doctor.count({ where: { available: true } }),
    ])

  return { totalPatients, totalAppointments, appointmentsToday, doctorsAvailable }
}

export async function getPanelMetrics(ctx: AuthContext) {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())
  const dayFilter = {
    clinicId: ctx.clinicId,
    ...appointmentDoctorFilter(ctx),
    date: { gte: todayStart, lte: todayEnd },
    type: "SCHEDULE" as const,
  }

  const [scheduled, confirmed, completed, noShow, newPatients, returningPatients] =
    await Promise.all([
      prisma.appointment.count({ where: { ...dayFilter, status: "SCHEDULED" } }),
      prisma.appointment.count({ where: { ...dayFilter, status: "CONFIRMED" } }),
      prisma.appointment.count({ where: { ...dayFilter, status: "COMPLETED" } }),
      prisma.appointment.count({ where: { ...dayFilter, status: "NO_SHOW" } }),
      prisma.patient.count({
        where: { clinicId: ctx.clinicId, createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.appointment.count({
        where: {
          ...dayFilter,
          patient: { appointments: { some: { date: { lt: todayStart } } } },
        },
      }),
    ])

  const byInsurance = await prisma.appointment.groupBy({
    by: ["insurancePlan"],
    where: dayFilter,
    _count: { insurancePlan: true },
  })

  const procedures = await prisma.appointmentProcedure.groupBy({
    by: ["procedureId"],
    _count: { procedureId: true },
    where: { appointment: dayFilter },
  })

  const procedureNames = await prisma.procedure.findMany({
    where: { id: { in: procedures.map((p) => p.procedureId) } },
  })

  const todayPatients = await prisma.patient.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    select: { id: true, name: true, birthDate: true, phone: true },
  })

  const today = new Date()
  const birthdaysToday = todayPatients
    .filter(
      (p) =>
        p.birthDate.getDate() === today.getDate() &&
        p.birthDate.getMonth() === today.getMonth()
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      age: today.getFullYear() - p.birthDate.getFullYear(),
    }))

  const ageBuckets = [
    { label: "0-17", min: 0, max: 17 },
    { label: "18-39", min: 18, max: 39 },
    { label: "40-59", min: 40, max: 59 },
    { label: "60+", min: 60, max: 200 },
  ]
  const ageDistribution = ageBuckets.map((b) => ({
    label: b.label,
    count: todayPatients.filter((p) => {
      const age = today.getFullYear() - p.birthDate.getFullYear()
      return age >= b.min && age <= b.max
    }).length,
  }))

  const periodStart = subDays(todayStart, 30)
  const completedInPeriod = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...appointmentDoctorFilter(ctx),
      type: "SCHEDULE",
      status: "COMPLETED",
      date: { gte: periodStart, lte: todayEnd },
    },
    select: { startTime: true, endTime: true },
  })

  let avgDurationMinutes: number | null = null
  if (completedInPeriod.length > 0) {
    const totalMinutes = completedInPeriod.reduce(
      (sum, apt) => sum + Math.max(0, timeToMinutes(apt.endTime) - timeToMinutes(apt.startTime)),
      0
    )
    avgDurationMinutes = Math.round(totalMinutes / completedInPeriod.length)
  }

  return {
    scheduled,
    confirmed,
    completed,
    noShow,
    newVsReturning: { new: newPatients, returning: returningPatients },
    byInsurance: byInsurance.map((i) => ({
      label: i.insurancePlan,
      count: i._count.insurancePlan,
    })),
    procedures: procedures.map((p) => ({
      label: procedureNames.find((n) => n.id === p.procedureId)?.name ?? "—",
      count: p._count.procedureId,
    })),
    appointmentsInPeriod: scheduled + confirmed + completed + noShow,
    avgDurationMinutes,
    birthdaysToday,
    ageDistribution,
  }
}

export async function getTodayPatients(ctx: AuthContext) {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...appointmentDoctorFilter(ctx),
      date: { gte: todayStart, lte: todayEnd },
      type: "SCHEDULE",
      patientId: { not: null },
    },
    orderBy: [{ startTime: "asc" }],
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      doctor: { select: { id: true, name: true, specialty: true } },
    },
  })

  return appointments.map((a) => ({
    id: a.id,
    patientId: a.patientId,
    time: a.startTime,
    endTime: a.endTime,
    status: a.status,
    date: a.date,
    patient: a.patient,
    doctor: a.doctor,
  }))
}

export async function getUpcomingAppointments(ctx: AuthContext) {
  const todayStart = startOfDay(new Date())

  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: ctx.clinicId,
      ...appointmentDoctorFilter(ctx),
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
  })

  return appointments.map((a) => ({ ...a, time: a.startTime }))
}

export async function getRecentPatients(ctx: AuthContext) {
  return prisma.patient.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, phone: true, createdAt: true, insurancePlan: true },
  })
}
