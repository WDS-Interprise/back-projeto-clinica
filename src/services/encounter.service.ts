import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import { assertDoctorInClinic } from "@/lib/doctor-clinic.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import {
  assertAppointmentStatusTransition,
  clinicalStatusRequiresRecordsWrite,
} from "@/lib/appointment-status.js"
import type { AuthContext } from "@/types/index.js"
import type { EncounterStatus, Prisma } from "@prisma/client"

const encounterInclude = {
  patient: {
    select: {
      id: true,
      name: true,
      phone: true,
      birthDate: true,
      gender: true,
      allergies: true,
      medications: true,
    },
  },
  doctor: { select: { id: true, name: true, specialty: true } },
  appointment: {
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      insurancePlan: true,
      type: true,
    },
  },
  addendums: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true } } },
  },
} satisfies Prisma.EncounterInclude

export type ClinicalEncounterInput = {
  mainComplaint?: string | null
  physicalExam?: string | null
  currentIllnessHistory?: string | null
  historyAndAntecedents?: string | null
  conduct?: string | null
  prescriptionSummary?: string | null
  notes?: string | null
  cidCode?: string | null
  cidDescription?: string | null
  cidVersion?: string | null
}

function assertCanWriteRecords(ctx: AuthContext) {
  if (!ctx.permissions.includes("records:write")) {
    throw new Error("PERMISSION_DENIED")
  }
}

function serializeEncounter(row: any) {
  return {
    ...row,
    addendums:
      row.addendums?.map((a: any) => ({
        id: a.id,
        body: a.body,
        reason: a.reason,
        createdAt: a.createdAt,
        authorId: a.authorId,
        authorName: a.author?.name ?? null,
      })) ?? [],
  }
}

async function audit(
  ctx: AuthContext,
  action: string,
  description: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  await writeAuditLog({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    module: "Atendimento",
    action,
    entityType: "Encounter",
    entityId,
    description,
    metadata,
  })
}

/** Copia campos clínicos legados do Appointment para o Encounter (migração lazy). */
function clinicalFromAppointment(apt: {
  mainComplaint: string | null
  physicalExam: string | null
  currentIllnessHistory: string | null
  historyAndAntecedents: string | null
  conduct: string | null
  prescriptionSummary: string | null
  notes: string | null
  cidCode: string | null
  cidDescription: string | null
  cidVersion: string | null
  startedAt: Date | null
}): ClinicalEncounterInput & { startedAt?: Date | null } {
  return {
    mainComplaint: apt.mainComplaint,
    physicalExam: apt.physicalExam,
    currentIllnessHistory: apt.currentIllnessHistory,
    historyAndAntecedents: apt.historyAndAntecedents,
    conduct: apt.conduct,
    prescriptionSummary: apt.prescriptionSummary,
    notes: apt.notes,
    cidCode: apt.cidCode,
    cidDescription: apt.cidDescription,
    cidVersion: apt.cidVersion,
    startedAt: apt.startedAt,
  }
}

async function syncAppointmentMirror(
  appointmentId: string,
  data: ClinicalEncounterInput & {
    status?: "IN_PROGRESS" | "COMPLETED"
    startedAt?: Date | null
    endedAt?: Date | null
  }
) {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.endedAt !== undefined ? { endedAt: data.endedAt } : {}),
      mainComplaint: data.mainComplaint === undefined ? undefined : data.mainComplaint,
      physicalExam: data.physicalExam === undefined ? undefined : data.physicalExam,
      currentIllnessHistory:
        data.currentIllnessHistory === undefined ? undefined : data.currentIllnessHistory,
      historyAndAntecedents:
        data.historyAndAntecedents === undefined ? undefined : data.historyAndAntecedents,
      conduct: data.conduct === undefined ? undefined : data.conduct,
      prescriptionSummary:
        data.prescriptionSummary === undefined ? undefined : data.prescriptionSummary,
      notes: data.notes === undefined ? undefined : data.notes,
      cidCode: data.cidCode === undefined ? undefined : data.cidCode,
      cidDescription: data.cidDescription === undefined ? undefined : data.cidDescription,
      cidVersion: data.cidVersion === undefined ? undefined : data.cidVersion,
    },
  })
}

export async function getById(ctx: AuthContext, id: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: encounterInclude,
  })
  if (!encounter) return null
  if (ctx.role === "DOCTOR" && ctx.doctorId && encounter.doctorId !== ctx.doctorId) {
    return null
  }
  return serializeEncounter(encounter)
}

export async function getActiveByAppointment(ctx: AuthContext, appointmentId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: {
      clinicId: ctx.clinicId,
      appointmentId,
      status: "IN_PROGRESS",
    },
    include: encounterInclude,
    orderBy: { startedAt: "desc" },
  })
  if (!encounter) return null
  if (ctx.role === "DOCTOR" && ctx.doctorId && encounter.doctorId !== ctx.doctorId) {
    return null
  }
  return serializeEncounter(encounter)
}

export async function listRecentByPatient(ctx: AuthContext, patientId: string, limit = 5) {
  const rows = await prisma.encounter.findMany({
    where: {
      clinicId: ctx.clinicId,
      patientId,
      status: "COMPLETED",
      ...(ctx.role === "DOCTOR" && ctx.doctorId ? { doctorId: ctx.doctorId } : {}),
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      mainComplaint: true,
      cidCode: true,
      cidDescription: true,
      doctor: { select: { name: true } },
    },
  })
  return rows
}

/**
 * Inicia ou retoma o Encounter ligado ao Appointment.
 * Nunca cria um segundo Encounter IN_PROGRESS para o mesmo appointment.
 */
export async function startOrResumeFromAppointment(ctx: AuthContext, appointmentId: string) {
  assertCanWriteRecords(ctx)

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId, ...appointmentDoctorFilter(ctx) },
  })
  if (!appointment) throw new Error("NOT_FOUND")
  if (appointment.type === "BLOCK") throw new Error("INVALID_STATUS_TRANSITION")
  if (!appointment.patientId) throw new Error("PATIENT_REQUIRED")

  if (ctx.role === "DOCTOR" && ctx.doctorId && appointment.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }

  const existingOpen = await prisma.encounter.findFirst({
    where: { clinicId: ctx.clinicId, appointmentId, status: "IN_PROGRESS" },
    include: encounterInclude,
  })
  if (existingOpen) {
    return { encounter: serializeEncounter(existingOpen), resumed: true as const }
  }

  if (appointment.status === "COMPLETED") {
    const completed = await prisma.encounter.findFirst({
      where: { clinicId: ctx.clinicId, appointmentId, status: "COMPLETED" },
      include: encounterInclude,
      orderBy: { endedAt: "desc" },
    })
    if (completed) {
      return { encounter: serializeEncounter(completed), resumed: false as const, alreadyCompleted: true as const }
    }
  }

  assertAppointmentStatusTransition({
    from: appointment.status,
    to: "IN_PROGRESS",
    type: appointment.type,
  })
  if (clinicalStatusRequiresRecordsWrite("IN_PROGRESS")) {
    assertCanWriteRecords(ctx)
  }

  await assertDoctorInClinic(ctx.clinicId, appointment.doctorId)

  const legacy = clinicalFromAppointment(appointment)
  const now = new Date()
  const startedAt = legacy.startedAt ?? now

  const created = await prisma.$transaction(async (tx) => {
    const encounter = await tx.encounter.create({
      data: {
        clinicId: ctx.clinicId,
        appointmentId: appointment.id,
        patientId: appointment.patientId!,
        doctorId: appointment.doctorId,
        status: "IN_PROGRESS",
        startedAt,
        lastSavedAt: now,
        mainComplaint: legacy.mainComplaint,
        physicalExam: legacy.physicalExam,
        currentIllnessHistory: legacy.currentIllnessHistory,
        historyAndAntecedents: legacy.historyAndAntecedents,
        conduct: legacy.conduct,
        prescriptionSummary: legacy.prescriptionSummary,
        notes: legacy.notes,
        cidCode: legacy.cidCode,
        cidDescription: legacy.cidDescription,
        cidVersion: legacy.cidVersion,
      },
      include: encounterInclude,
    })

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: appointment.startedAt ?? startedAt,
      },
    })

    return encounter
  })

  await audit(ctx, "ENCOUNTER_STARTED", "Atendimento clínico iniciado", created.id, {
    appointmentId,
  })

  return { encounter: serializeEncounter(created), resumed: false as const }
}

export async function updateClinical(ctx: AuthContext, id: string, data: ClinicalEncounterInput) {
  assertCanWriteRecords(ctx)

  const existing = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  if (existing.status === "COMPLETED") {
    throw new Error("ENCOUNTER_CLOSED")
  }

  const now = new Date()
  const updated = await prisma.encounter.update({
    where: { id },
    data: {
      mainComplaint: data.mainComplaint === undefined ? undefined : data.mainComplaint,
      physicalExam: data.physicalExam === undefined ? undefined : data.physicalExam,
      currentIllnessHistory:
        data.currentIllnessHistory === undefined ? undefined : data.currentIllnessHistory,
      historyAndAntecedents:
        data.historyAndAntecedents === undefined ? undefined : data.historyAndAntecedents,
      conduct: data.conduct === undefined ? undefined : data.conduct,
      prescriptionSummary:
        data.prescriptionSummary === undefined ? undefined : data.prescriptionSummary,
      notes: data.notes === undefined ? undefined : data.notes,
      cidCode: data.cidCode === undefined ? undefined : data.cidCode,
      cidDescription: data.cidDescription === undefined ? undefined : data.cidDescription,
      cidVersion: data.cidVersion === undefined ? undefined : data.cidVersion,
      lastSavedAt: now,
    },
    include: encounterInclude,
  })

  if (existing.appointmentId) {
    await syncAppointmentMirror(existing.appointmentId, data)
  }

  const cidChanged = data.cidCode !== undefined && data.cidCode !== existing.cidCode
  if (cidChanged) {
    await audit(
      ctx,
      data.cidCode ? "CID_ADDED" : "CID_REMOVED",
      data.cidCode ? `CID ${data.cidCode} vinculado` : "CID removido",
      id,
      { cidCode: data.cidCode, cidDescription: data.cidDescription, cidVersion: data.cidVersion }
    )
  } else {
    await audit(ctx, "ENCOUNTER_UPDATED", "Evolução clínica atualizada", id)
  }

  return serializeEncounter(updated)
}

export async function complete(ctx: AuthContext, id: string) {
  assertCanWriteRecords(ctx)

  const existing = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  if (existing.status === "COMPLETED") {
    return getById(ctx, id)
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const encounter = await tx.encounter.update({
      where: { id },
      data: {
        status: "COMPLETED" satisfies EncounterStatus,
        endedAt: now,
        lastSavedAt: now,
      },
      include: encounterInclude,
    })

    if (existing.appointmentId) {
      const apt = await tx.appointment.findFirst({ where: { id: existing.appointmentId } })
      if (apt) {
        assertAppointmentStatusTransition({
          from: apt.status,
          to: "COMPLETED",
          type: apt.type,
        })
        await tx.appointment.update({
          where: { id: existing.appointmentId },
          data: { status: "COMPLETED", endedAt: apt.endedAt ?? now },
        })
      }
    }

    return encounter
  })

  await audit(ctx, "ENCOUNTER_COMPLETED", "Atendimento clínico finalizado", id)
  return serializeEncounter(updated)
}

export async function addAddendum(
  ctx: AuthContext,
  id: string,
  input: { body: string; reason?: string | null }
) {
  assertCanWriteRecords(ctx)

  const body = input.body?.trim()
  if (!body) throw new Error("ADDENDUM_BODY_REQUIRED")

  const existing = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  if (existing.status !== "COMPLETED") {
    throw new Error("ENCOUNTER_NOT_COMPLETED")
  }

  await prisma.encounterAddendum.create({
    data: {
      encounterId: id,
      authorId: ctx.userId,
      body,
      reason: input.reason?.trim() || null,
    },
  })

  await audit(ctx, "ADDENDUM_CREATED", "Adendo clínico criado", id, {
    reason: input.reason ?? null,
  })

  return getById(ctx, id)
}

export async function resolveForAttendanceRoute(ctx: AuthContext, routeId: string) {
  const asEncounter = await getById(ctx, routeId)
  if (asEncounter) return { kind: "encounter" as const, encounter: asEncounter }

  const open = await getActiveByAppointment(ctx, routeId)
  if (open) return { kind: "appointment" as const, encounter: open, resumed: true }

  const any = await prisma.encounter.findFirst({
    where: { clinicId: ctx.clinicId, appointmentId: routeId },
    include: encounterInclude,
    orderBy: { createdAt: "desc" },
  })
  if (any) {
    if (ctx.role === "DOCTOR" && ctx.doctorId && any.doctorId !== ctx.doctorId) {
      return null
    }
    return { kind: "appointment" as const, encounter: serializeEncounter(any) }
  }

  return null
}
