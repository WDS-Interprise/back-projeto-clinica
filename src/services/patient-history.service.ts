import prisma from "@/lib/prisma.js"
import { appointmentDoctorFilter } from "@/lib/auth-context.js"
import type { AuthContext } from "@/types/index.js"

const MONTHS_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

export type PatientHistoryAddendum = {
  id: string
  body: string
  reason?: string | null
  createdAt: string
  authorName: string
}

export type PatientHistoryRecord =
  | {
      id: string
      type: "ATTENDANCE"
      appointmentId: string | null
      encounterId: string | null
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
      addendums?: PatientHistoryAddendum[]
    }
  | {
      id: string
      type: "PRESCRIPTION"
      prescriptionId: string
      appointmentId?: string | null
      encounterId?: string | null
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

function computeDurationMinutes(input: {
  startedAt: Date | null
  endedAt: Date | null
  startTime?: string
  endTime?: string
}): number | null {
  if (input.startedAt && input.endedAt) {
    const mins = Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60000)
    return mins > 0 ? mins : null
  }
  if (input.startTime && input.endTime) {
    const start = parseTimeToMinutes(input.startTime)
    const end = parseTimeToMinutes(input.endTime)
    if (end > start) return end - start
  }
  return null
}

function formatDiagnosticHypothesis(row: {
  cidCode: string | null
  cidDescription: string | null
}): string | null {
  if (row.cidCode && row.cidDescription) return `${row.cidCode} - ${row.cidDescription}`
  if (row.cidDescription) return row.cidDescription
  if (row.cidCode) return row.cidCode
  return null
}

function recordSortKey(record: PatientHistoryRecord): number {
  const [h, m] = record.time.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function hasClinicalContent(row: {
  mainComplaint: string | null
  physicalExam: string | null
  currentIllnessHistory: string | null
  historyAndAntecedents: string | null
  conduct: string | null
  prescriptionSummary: string | null
  cidCode: string | null
  notes: string | null
  status: string
}) {
  return (
    Boolean(row.mainComplaint?.trim()) ||
    Boolean(row.physicalExam?.trim()) ||
    Boolean(row.currentIllnessHistory?.trim()) ||
    Boolean(row.historyAndAntecedents?.trim()) ||
    Boolean(row.conduct?.trim()) ||
    Boolean(row.prescriptionSummary?.trim()) ||
    Boolean(row.cidCode) ||
    Boolean(row.notes?.trim()) ||
    row.status === "COMPLETED" ||
    row.status === "IN_PROGRESS"
  )
}

export async function getPatientHistory(ctx: AuthContext, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId },
    select: { id: true },
  })
  if (!patient) return null

  const [appointments, encounters, prescriptions] = await Promise.all([
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
    prisma.encounter.findMany({
      where: {
        patientId,
        clinicId: ctx.clinicId,
        ...(ctx.role === "DOCTOR" && ctx.doctorId ? { doctorId: ctx.doctorId } : {}),
      },
      include: {
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, date: true, startTime: true, endTime: true, status: true } },
        addendums: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
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

  const encounterByAppointment = new Map<string, (typeof encounters)[number]>()
  for (const enc of encounters) {
    if (enc.appointmentId && !encounterByAppointment.has(enc.appointmentId)) {
      encounterByAppointment.set(enc.appointmentId, enc)
    }
  }

  const prescriptionsByAppointment = new Map<string, typeof prescriptions>()
  const prescriptionsByEncounter = new Map<string, typeof prescriptions>()
  const standalonePrescriptions: typeof prescriptions = []
  for (const rx of prescriptions) {
    if (rx.encounterId) {
      const list = prescriptionsByEncounter.get(rx.encounterId) ?? []
      list.push(rx)
      prescriptionsByEncounter.set(rx.encounterId, list)
    } else if (rx.appointmentId) {
      const list = prescriptionsByAppointment.get(rx.appointmentId) ?? []
      list.push(rx)
      prescriptionsByAppointment.set(rx.appointmentId, list)
    } else {
      standalonePrescriptions.push(rx)
    }
  }

  const recordsByDate = new Map<string, PatientHistoryRecord[]>()
  const seenEncounterIds = new Set<string>()

  const pushRecord = (dateKey: string, record: PatientHistoryRecord) => {
    const list = recordsByDate.get(dateKey) ?? []
    list.push(record)
    recordsByDate.set(dateKey, list)
  }

  const pushRx = (
    dateKey: string,
    rx: (typeof prescriptions)[number],
    professionalFallback: string
  ) => {
    pushRecord(dateKey, {
      id: `rx-${rx.id}`,
      type: "PRESCRIPTION",
      prescriptionId: rx.id,
      appointmentId: rx.appointmentId,
      encounterId: rx.encounterId,
      status: rx.status,
      professionalName: rx.professional?.name ?? professionalFallback,
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

  for (const apt of appointments) {
    const dateKey = apt.date.toISOString().slice(0, 10)
    const professionalName = apt.doctor?.name ?? "Profissional"
    const enc = encounterByAppointment.get(apt.id)

    if (enc) {
      seenEncounterIds.add(enc.id)
      const locked = enc.status === "COMPLETED"
      const source = {
        mainComplaint: enc.mainComplaint,
        physicalExam: enc.physicalExam,
        currentIllnessHistory: enc.currentIllnessHistory,
        historyAndAntecedents: enc.historyAndAntecedents,
        conduct: enc.conduct,
        prescriptionSummary: enc.prescriptionSummary,
        cidCode: enc.cidCode,
        cidDescription: enc.cidDescription,
        notes: enc.notes,
        status: enc.status,
      }
      if (hasClinicalContent(source) || apt.status !== "CANCELLED") {
        pushRecord(dateKey, {
          id: `att-${enc.id}`,
          type: "ATTENDANCE",
          appointmentId: apt.id,
          encounterId: enc.id,
          status: enc.status === "COMPLETED" ? "COMPLETED" : apt.status,
          professionalName: enc.doctor?.name ?? professionalName,
          time: apt.startTime,
          durationMinutes: computeDurationMinutes({
            startedAt: enc.startedAt,
            endedAt: enc.endedAt,
            startTime: apt.startTime,
            endTime: apt.endTime,
          }),
          locked,
          attendance: {
            mainComplaint: enc.mainComplaint,
            physicalExam: enc.physicalExam,
            currentIllnessHistory: enc.currentIllnessHistory,
            historyAndAntecedents: enc.historyAndAntecedents,
            diagnosticHypothesis: formatDiagnosticHypothesis(enc),
            cidCode: enc.cidCode,
            cidDescription: enc.cidDescription,
            conduct: enc.conduct,
            prescriptionSummary: enc.prescriptionSummary,
            notes: enc.notes,
          },
          addendums: enc.addendums.map((a) => ({
            id: a.id,
            body: a.body,
            reason: a.reason,
            createdAt: a.createdAt.toISOString(),
            authorName: a.author?.name ?? "Profissional",
          })),
        })
      }

      for (const rx of prescriptionsByEncounter.get(enc.id) ?? []) {
        pushRx(dateKey, rx, professionalName)
      }
    } else {
      const locked = apt.status === "COMPLETED"
      if (hasClinicalContent(apt) || apt.status !== "CANCELLED") {
        pushRecord(dateKey, {
          id: `att-${apt.id}`,
          type: "ATTENDANCE",
          appointmentId: apt.id,
          encounterId: null,
          status: apt.status,
          professionalName,
          time: apt.startTime,
          durationMinutes: computeDurationMinutes(apt),
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
          addendums: [],
        })
      }
    }

    for (const rx of prescriptionsByAppointment.get(apt.id) ?? []) {
      if (rx.encounterId && seenEncounterIds.has(rx.encounterId)) continue
      pushRx(dateKey, rx, professionalName)
    }
  }

  for (const enc of encounters) {
    if (seenEncounterIds.has(enc.id)) continue
    const dateKey = (enc.startedAt ?? enc.createdAt).toISOString().slice(0, 10)
    const professionalName = enc.doctor?.name ?? "Profissional"
    pushRecord(dateKey, {
      id: `att-${enc.id}`,
      type: "ATTENDANCE",
      appointmentId: enc.appointmentId,
      encounterId: enc.id,
      status: enc.status,
      professionalName,
      time: enc.appointment?.startTime ??
        (enc.startedAt
          ? enc.startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "00:00"),
      durationMinutes: computeDurationMinutes({
        startedAt: enc.startedAt,
        endedAt: enc.endedAt,
        startTime: enc.appointment?.startTime,
        endTime: enc.appointment?.endTime,
      }),
      locked: enc.status === "COMPLETED",
      attendance: {
        mainComplaint: enc.mainComplaint,
        physicalExam: enc.physicalExam,
        currentIllnessHistory: enc.currentIllnessHistory,
        historyAndAntecedents: enc.historyAndAntecedents,
        diagnosticHypothesis: formatDiagnosticHypothesis(enc),
        cidCode: enc.cidCode,
        cidDescription: enc.cidDescription,
        conduct: enc.conduct,
        prescriptionSummary: enc.prescriptionSummary,
        notes: enc.notes,
      },
      addendums: enc.addendums.map((a) => ({
        id: a.id,
        body: a.body,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
        authorName: a.author?.name ?? "Profissional",
      })),
    })
    for (const rx of prescriptionsByEncounter.get(enc.id) ?? []) {
      pushRx(dateKey, rx, professionalName)
    }
  }

  for (const rx of standalonePrescriptions) {
    const dateKey = rx.prescriptionDate.toISOString().slice(0, 10)
    pushRx(dateKey, rx, "Profissional")
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
