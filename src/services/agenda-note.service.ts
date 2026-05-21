import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type { AgendaNoteType, AgendaNoteVisibility } from "@prisma/client"
import { parseDateOnly } from "@/lib/appointment-helpers.js"

const include = {
  doctor: { select: { id: true, name: true } },
  patient: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
}

function parseNoteDate(dateStr?: string) {
  const d = dateStr ? parseDateOnly(dateStr) : new Date()
  d.setHours(12, 0, 0, 0)
  return d
}

export async function list(ctx: AuthContext, params: { date?: string; startDate?: string; endDate?: string }) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId }

  if (params.date) {
    const d = parseNoteDate(params.date)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    where.date = { gte: d, lt: next }
  } else if (params.startDate && params.endDate) {
    const start = parseNoteDate(params.startDate)
    const end = parseNoteDate(params.endDate)
    end.setDate(end.getDate() + 1)
    where.date = { gte: start, lt: end }
  } else {
    const d = parseNoteDate()
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    where.date = { gte: d, lt: next }
  }

  if (ctx.role === "RECEPTION") {
    where.visibility = { in: ["RECEPTION_ONLY", "CLINIC"] }
  } else if (ctx.role === "DOCTOR") {
    where.visibility = { in: ["PROFESSIONAL", "CLINIC"] }
  }

  return prisma.agendaNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include,
  })
}

export async function getById(ctx: AuthContext, id: string) {
  return prisma.agendaNote.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include,
  })
}

export async function create(
  ctx: AuthContext,
  data: {
    title: string
    description: string
    date?: string
    doctorId?: string
    patientId?: string
    type?: AgendaNoteType
    visibility?: AgendaNoteVisibility
  }
) {
  return prisma.agendaNote.create({
    data: {
      clinicId: ctx.clinicId,
      title: data.title,
      description: data.description,
      date: parseNoteDate(data.date),
      doctorId: data.doctorId ?? null,
      patientId: data.patientId ?? null,
      type: data.type ?? "DAY",
      visibility: data.visibility ?? "CLINIC",
      createdById: ctx.userId,
    },
    include,
  })
}

export async function update(
  ctx: AuthContext,
  id: string,
  data: Partial<{
    title: string
    description: string
    type: AgendaNoteType
    visibility: AgendaNoteVisibility
  }>
) {
  const existing = await getById(ctx, id)
  if (!existing) return null
  if (ctx.role !== "ADMIN" && existing.createdById !== ctx.userId) {
    throw new Error("FORBIDDEN")
  }

  return prisma.agendaNote.update({
    where: { id },
    data,
    include,
  })
}

export async function remove(ctx: AuthContext, id: string) {
  const existing = await getById(ctx, id)
  if (!existing) throw new Error("NOT_FOUND")
  if (ctx.role !== "ADMIN" && existing.createdById !== ctx.userId) {
    throw new Error("FORBIDDEN")
  }
  await prisma.agendaNote.delete({ where: { id } })
}
