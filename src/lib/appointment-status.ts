import type { AppointmentStatus, AppointmentType } from "@prisma/client"

/** Transições operacionais + clínicas permitidas no Appointment. */
const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "RESCHEDULED", "NO_SHOW", "IN_PROGRESS"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
}

const CLINICAL_STATUSES: AppointmentStatus[] = ["IN_PROGRESS", "COMPLETED"]

export function isClinicalStatusTransition(
  from: AppointmentStatus,
  to: AppointmentStatus
): boolean {
  return CLINICAL_STATUSES.includes(to) && from !== to
}

export function assertAppointmentStatusTransition(input: {
  from: AppointmentStatus
  to: AppointmentStatus
  type?: AppointmentType
}) {
  const { from, to, type } = input
  if (from === to) return

  if (type === "BLOCK" && (to === "IN_PROGRESS" || to === "COMPLETED")) {
    throw new Error("INVALID_STATUS_TRANSITION")
  }

  const allowed = ALLOWED[from] ?? []
  if (!allowed.includes(to)) {
    throw new Error("INVALID_STATUS_TRANSITION")
  }
}

export function clinicalStatusRequiresRecordsWrite(to: AppointmentStatus): boolean {
  return to === "IN_PROGRESS" || to === "COMPLETED"
}
