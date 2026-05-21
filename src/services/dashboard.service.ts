import prisma from "@/lib/prisma.js"
import { startOfDay, endOfDay } from "date-fns"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

function clinicWhere(ctx: AuthContext) {
  return { clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) }
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
    avgDurationMinutes: 32,
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
