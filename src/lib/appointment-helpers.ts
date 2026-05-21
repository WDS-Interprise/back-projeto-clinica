import { addDays, addMonths, addWeeks, addYears } from "date-fns"
import type { Recurrence } from "@prisma/client"

export type ProcedureInput = {
  procedureId: string
  quantity: number
  unitPrice: number
}

export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function computeTotal(procedures: ProcedureInput[]): number {
  return procedures.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0)
}

export function buildRecurrenceDates(
  start: Date,
  recurrence: Recurrence,
  maxOccurrences = 12
): Date[] {
  if (recurrence === "NONE") return [start]

  const dates: Date[] = [start]
  let current = start

  while (dates.length < maxOccurrences) {
    switch (recurrence) {
      case "DAILY":
        current = addDays(current, 1)
        break
      case "WEEKLY":
        current = addWeeks(current, 1)
        break
      case "BIWEEKLY":
        current = addDays(current, 14)
        break
      case "MONTHLY":
        current = addMonths(current, 1)
        break
      case "YEARLY":
        current = addYears(current, 1)
        break
      default:
        return dates
    }
    dates.push(current)
  }

  return dates
}

export const appointmentInclude = {
  patient: {
    select: {
      id: true,
      name: true,
      phone: true,
      phoneHome: true,
      email: true,
      insurancePlan: true,
      birthDate: true,
      gender: true,
    },
  },
  doctor: { select: { id: true, name: true, specialty: true, email: true } },
  procedures: { include: { procedure: true } },
  billing: true,
} as const
