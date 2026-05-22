import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

const MONTHS_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

export type PatientHistoryRecord =
  | {
      id: string
      type: "ATTENDANCE"
      appointmentId: string
      status: string
      professionalName: string
      time: string
      durationMinutes: number | null
      locked: boolean
      attendance: {
        mainComplaint?: string | null
        physicalExam?: string | null
        currentIllnessHistory?: string | null
        historyAndAntecedents?: string | null
        diagnosticHypothesis?: string | null
        cidCode?: string | null
        cidDescription?: string | null
        conduct?: string | null
        prescriptionSummary?: string | null
        notes?: string | null
      }
    }
  | {
      id: string
      type: "PRESCRIPTION"
      prescriptionId: string
      appointmentId?: string | null
      status: string
      professionalName: string
      time: string
      prescriptionNumber: number
      prescription: {
        receiptType: string
        notes?: string | null
        validationCode?: string | null
        items: Array<{
          id: string
          type: string
          name: string
          presentation?: string | null
          dosage?: string | null
          frequency?: string | null
          quantity?: string | null
          instructions?: string | null
          continuousUse: boolean
        }>
      }
    }

export type PatientHistoryDayGroup = {
  date: string
  day: number
  month: string
  year: number
  records: PatientHistoryRecord[]
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function computeDurationMinutes(apt: {
  startedAt: Date | null
  endedAt: Date | null
  startTime: string
  endTime: string
}): number | null {
  if (apt.startedAt && apt.endedAt) {
    const mins = Math.round((apt.endedAt.getTime() - apt.startedAt.getTime()) / 60000)
    return mins > 0 ? mins : null
  }
  const start = parseTimeToMinutes(apt.startTime)
  const end = parseTimeToMinutes(apt.endTime)
  if (end > start) return end - start
  return null
}

function formatDiagnosticHypothesis(apt: {
  cidCode: string | null
  cidDescription: string | null
}): string | null {
  if (apt.cidCode && apt.cidDescription) return `${apt.cidCode} - ${apt.cidDescription}`
  if (apt.cidDescription) return apt.cidDescription
  if (apt.cidCode) return apt.cidCode
  return null
}

function recordSortKey(record: PatientHistoryRecord): number {
  const [h, m] = record.time.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export async function getPatientHistory(ctx: AuthContext, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId },
    select: { id: true },
  })
  if (!patient) return null

  const [appointments, prescriptions] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        patientId,
        clinicId: ctx.clinicId,
        ...appointmentDoctorFilter(ctx),
      },
      include: {
        doctor: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 100,
    }),
    prisma.prescription.findMany({
      where: {
        patientId,
        clinicId: ctx.clinicId,
        status: "FINALIZED",
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        professional: { select: { id: true, name: true } },
      },
      orderBy: { prescriptionDate: "desc" },
      take: 100,
    }),
  ])

  const prescriptionsByAppointment = new Map<string, typeof prescriptions>()
  const standalonePrescriptions: typeof prescriptions = []
  for (const rx of prescriptions) {
    if (rx.appointmentId) {
      const list = prescriptionsByAppointment.get(rx.appointmentId) ?? []
      list.push(rx)
      prescriptionsByAppointment.set(rx.appointmentId, list)
    } else {
      standalonePrescriptions.push(rx)
    }
  }

  const recordsByDate = new Map<string, PatientHistoryRecord[]>()

  const pushRecord = (dateKey: string, record: PatientHistoryRecord) => {
    const list = recordsByDate.get(dateKey) ?? []
    list.push(record)
    recordsByDate.set(dateKey, list)
  }

  for (const apt of appointments) {
    const dateKey = apt.date.toISOString().slice(0, 10)
    const professionalName = apt.doctor?.name ?? "Profissional"
    const durationMinutes = computeDurationMinutes(apt)
    const locked = apt.status === "COMPLETED"

    const hasClinicalContent =
      Boolean(apt.mainComplaint?.trim()) ||
      Boolean(apt.physicalExam?.trim()) ||
      Boolean(apt.currentIllnessHistory?.trim()) ||
      Boolean(apt.historyAndAntecedents?.trim()) ||
      Boolean(apt.conduct?.trim()) ||
      Boolean(apt.prescriptionSummary?.trim()) ||
      Boolean(apt.cidCode) ||
      Boolean(apt.notes?.trim()) ||
      apt.status === "COMPLETED" ||
      apt.status === "IN_PROGRESS"

    if (hasClinicalContent || apt.status !== "CANCELLED") {
      pushRecord(dateKey, {
        id: `att-${apt.id}`,
        type: "ATTENDANCE",
        appointmentId: apt.id,
        status: apt.status,
        professionalName,
        time: apt.startTime,
        durationMinutes,
        locked,
        attendance: {
          mainComplaint: apt.mainComplaint,
          physicalExam: apt.physicalExam,
          currentIllnessHistory: apt.currentIllnessHistory,
          historyAndAntecedents: apt.historyAndAntecedents,
          diagnosticHypothesis: formatDiagnosticHypothesis(apt),
          cidCode: apt.cidCode,
          cidDescription: apt.cidDescription,
          conduct: apt.conduct,
          prescriptionSummary: apt.prescriptionSummary,
          notes: apt.notes,
        },
      })
    }

    const linked = prescriptionsByAppointment.get(apt.id) ?? []
    for (const rx of linked) {
      pushRecord(dateKey, {
        id: `rx-${rx.id}`,
        type: "PRESCRIPTION",
        prescriptionId: rx.id,
        appointmentId: rx.appointmentId,
        status: rx.status,
        professionalName: rx.professional?.name ?? professionalName,
        time: rx.updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        prescriptionNumber: 0,
        prescription: {
          receiptType: rx.receiptType,
          notes: rx.notes,
          validationCode: rx.validationCode,
          items: rx.items.map((item) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            presentation: item.presentation,
            dosage: item.dosage,
            frequency: item.frequency,
            quantity: item.quantity,
            instructions: item.instructions,
            continuousUse: item.continuousUse,
          })),
        },
      })
    }
  }

  for (const rx of standalonePrescriptions) {
    const dateKey = rx.prescriptionDate.toISOString().slice(0, 10)
    pushRecord(dateKey, {
      id: `rx-${rx.id}`,
      type: "PRESCRIPTION",
      prescriptionId: rx.id,
      appointmentId: null,
      status: rx.status,
      professionalName: rx.professional?.name ?? "Profissional",
      time: rx.updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      prescriptionNumber: 0,
      prescription: {
        receiptType: rx.receiptType,
        notes: rx.notes,
        validationCode: rx.validationCode,
        items: rx.items.map((item) => ({
          id: item.id,
          type: item.type,
          name: item.name,
          presentation: item.presentation,
          dosage: item.dosage,
          frequency: item.frequency,
          quantity: item.quantity,
          instructions: item.instructions,
          continuousUse: item.continuousUse,
        })),
      },
    })
  }

  const days: PatientHistoryDayGroup[] = [...recordsByDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, records]) => {
      const d = new Date(`${dateKey}T12:00:00`)
      return {
        date: dateKey,
        day: d.getDate(),
        month: MONTHS_PT[d.getMonth()] ?? "",
        year: d.getFullYear(),
        records: (() => {
          const sorted = records.sort((a, b) => recordSortKey(b) - recordSortKey(a))
          let rxNum = sorted.filter((r) => r.type === "PRESCRIPTION").length
          return sorted.map((record) => {
            if (record.type !== "PRESCRIPTION") return record
            return { ...record, prescriptionNumber: rxNum-- }
          })
        })(),
      }
    })

  return { patientId, days }
}
