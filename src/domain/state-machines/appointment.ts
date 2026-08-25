import type { AppointmentStatus, AppointmentType } from "@prisma/client"
import { DomainError, DomainCodes } from "@/lib/domain-error.js"

/**
 * Fluxo operacional do ClinMax (sem CHECKED_IN: o produto nao separa chegada de inicio).
 *
 * SCHEDULED -> CONFIRMED | CANCELLED | RESCHEDULED | NO_SHOW | IN_PROGRESS
 * CONFIRMED -> IN_PROGRESS | CANCELLED | RESCHEDULED | NO_SHOW
 * IN_PROGRESS -> COMPLETED | CANCELLED
 * COMPLETED, CANCELLED, NO_SHOW, RESCHEDULED: terminais
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "RESCHEDULED", "NO_SHOW", "IN_PROGRESS"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
}

const CLINICAL_STATUSES: AppointmentStatus[] = ["IN_PROGRESS", "COMPLETED"]

export function isClinicalStatusTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return CLINICAL_STATUSES.includes(to) && from !== to
}

export function clinicalStatusRequiresRecordsWrite(to: AppointmentStatus): boolean {
  return to === "IN_PROGRESS" || to === "COMPLETED"
}

export function assertAppointmentStatusTransition(input: {
  from: AppointmentStatus
  to: AppointmentStatus
  type?: AppointmentType
}) {
  const { from, to, type } = input
  if (from === to) return

  if (type === "BLOCK" && (to === "IN_PROGRESS" || to === "COMPLETED")) {
    throw new DomainError(
      DomainCodes.INVALID_APPOINTMENT_STATE,
      "Bloqueio de agenda nao pode virar atendimento clinico",
      409
    )
  }

  const allowed = APPOINTMENT_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new DomainError(
      DomainCodes.INVALID_APPOINTMENT_STATE,
      `Transicao de agendamento invalida: ${from} -> ${to}`,
      409
    )
  }
}
