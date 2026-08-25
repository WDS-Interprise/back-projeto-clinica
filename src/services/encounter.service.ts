import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import { assertDoctorInClinic } from "@/lib/doctor-clinic.js"
import { writeAuditLog, writeAuditLogInTx } from "@/lib/audit-log.js"
import {
  assertAppointmentStatusTransition,
  clinicalStatusRequiresRecordsWrite,
} from "@/lib/appointment-status.js"
import {
  assertEncounterCanAddendum,
  assertEncounterCanEdit,
  assertEncounterTransition,
  encounterCompleteIsIdempotent,
  type EncounterMachineStatus,
} from "@/domain/state-machines/encounter.js"
import {
  assertCanWriteRecords,
  assertOptimisticLock,
  assertOwnsClinicalResource,
} from "@/domain/authorization/clinical.js"
import type { AuthContext } from "@/types/index.js"
import type { EncounterStatus, Prisma } from "@prisma/client"

export type EncounterSignatureMode = "NONE" | "LOCAL_CERT" | "CLOUD_CERT"

export type CompleteEncounterInput = {
  signatureMode?: EncounterSignatureMode
  expectedVersion?: number
}

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
  metadata?: Record<string, unknown>,
  required = false
) {
  await writeAuditLog({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    actorRole: ctx.role,
    module: "Atendimento",
    action,
    entityType: "Encounter",
    entityId,
    description,
    metadata,
    required,
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
  assertOwnsClinicalResource(ctx, { doctorId: appointment.doctorId })

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
        version: 1,
        signatureMode: null,
        signatureStatus: "NONE",
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

    await writeAuditLogInTx(tx, {
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      actorRole: ctx.role,
      module: "Atendimento",
      action: "ENCOUNTER_STARTED",
      entityType: "Encounter",
      entityId: encounter.id,
      description: "Atendimento clinico iniciado",
      metadata: { appointmentId },
      required: true,
    })

    return encounter
  })

  return { encounter: serializeEncounter(created), resumed: false as const }
}

export async function updateClinical(
  ctx: AuthContext,
  id: string,
  data: ClinicalEncounterInput & { expectedVersion?: number }
) {
  assertCanWriteRecords(ctx)

  const existing = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  assertOwnsClinicalResource(ctx, { doctorId: existing.doctorId })
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  assertEncounterCanEdit(existing.status as EncounterMachineStatus)
  assertOptimisticLock(existing.version, data.expectedVersion)

  const now = new Date()
  const updated = await prisma.encounter.updateMany({
    where: { id, clinicId: ctx.clinicId, version: existing.version },
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
      version: existing.version + 1,
    },
  })

  if (updated.count === 0) {
    const { DomainError, DomainCodes } = await import("@/lib/domain-error.js")
    throw new DomainError(
      DomainCodes.VERSION_CONFLICT,
      "O atendimento foi alterado em outra sessao. Recarregue e tente novamente",
      409
    )
  }

  const row = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
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
      data.cidCode ? "CID vinculado" : "CID removido",
      id,
      { cidCode: data.cidCode ?? undefined, cidVersion: data.cidVersion ?? undefined }
    )
  }

  return serializeEncounter(row)
}

export async function complete(ctx: AuthContext, id: string, input: CompleteEncounterInput = {}) {
  assertCanWriteRecords(ctx)

  const existing = await prisma.encounter.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")
  assertOwnsClinicalResource(ctx, { doctorId: existing.doctorId })
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  if (encounterCompleteIsIdempotent(existing.status as EncounterMachineStatus)) {
    return getById(ctx, id)
  }

  assertEncounterTransition(existing.status as EncounterMachineStatus, "COMPLETED")
  assertOptimisticLock(existing.version, input.expectedVersion)

  const signatureMode: EncounterSignatureMode = input.signatureMode ?? "NONE"
  if (signatureMode !== "NONE" && signatureMode !== "LOCAL_CERT" && signatureMode !== "CLOUD_CERT") {
    const { DomainError } = await import("@/lib/domain-error.js")
    throw new DomainError("SIGNATURE_UNSUPPORTED", "Modo de assinatura nao suportado", 400)
  }

  const now = new Date()
  const signatureStatus = signatureMode === "NONE" ? "NONE" : "REQUESTED"

  const updated = await prisma.$transaction(async (tx) => {
    const locked = await tx.encounter.updateMany({
      where: {
        id,
        clinicId: ctx.clinicId,
        status: existing.status,
        version: existing.version,
      },
      data: {
        status: "COMPLETED" satisfies EncounterStatus,
        endedAt: now,
        lastSavedAt: now,
        version: existing.version + 1,
        signatureMode,
        signatureStatus,
      },
    })
    if (locked.count === 0) {
      const { DomainError, DomainCodes } = await import("@/lib/domain-error.js")
      throw new DomainError(
        DomainCodes.VERSION_CONFLICT,
        "O atendimento foi alterado em outra sessao. Recarregue e tente novamente",
        409
      )
    }

    if (existing.appointmentId) {
      const apt = await tx.appointment.findFirst({
        where: { id: existing.appointmentId, clinicId: ctx.clinicId },
      })
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

    await writeAuditLogInTx(tx, {
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      actorRole: ctx.role,
      module: "Atendimento",
      action: "ENCOUNTER_COMPLETED",
      entityType: "Encounter",
      entityId: id,
      description: "Atendimento clinico finalizado",
      metadata: { appointmentId: existing.appointmentId ?? undefined, signatureMode, signatureStatus },
      required: true,
    })

    return tx.encounter.findFirst({
      where: { id, clinicId: ctx.clinicId },
      include: encounterInclude,
    })
  })

  return serializeEncounter(updated)
}

export async function cancelFromAppointment(ctx: AuthContext, appointmentId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma
  const open = await db.encounter.findFirst({
    where: { appointmentId, clinicId: ctx.clinicId, status: "IN_PROGRESS" },
  })
  if (!open) return null
  assertEncounterTransition(open.status as EncounterMachineStatus, "CANCELLED")
  const now = new Date()
  await db.encounter.update({
    where: { id: open.id },
    data: {
      status: "CANCELLED",
      endedAt: now,
      lastSavedAt: now,
      version: open.version + 1,
    },
  })
  await writeAuditLogInTx(db, {
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    actorRole: ctx.role,
    module: "Atendimento",
    action: "ENCOUNTER_CANCELLED",
    entityType: "Encounter",
    entityId: open.id,
    description: "Atendimento clinico cancelado",
    metadata: { appointmentId },
    required: true,
  })
  return open.id
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
  assertOwnsClinicalResource(ctx, { doctorId: existing.doctorId })
  if (ctx.role === "DOCTOR" && ctx.doctorId && existing.doctorId !== ctx.doctorId) {
    throw new Error("DOCTOR_NOT_ALLOWED")
  }
  assertEncounterCanAddendum(existing.status as EncounterMachineStatus)

  await prisma.encounterAddendum.create({
    data: {
      encounterId: id,
      authorId: ctx.userId,
      body,
      reason: input.reason?.trim() || null,
    },
  })

  await audit(ctx, "ADDENDUM_CREATED", "Adendo clinico criado", id, {
    hasAddendumReason: Boolean(input.reason?.trim()),
  }, true)

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
