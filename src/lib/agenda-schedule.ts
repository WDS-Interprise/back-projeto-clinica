export type AgendaSchedule = {
  agendaStartTime: string
  agendaEndTime: string
  lunchStartTime: string
  lunchEndTime: string
  slotIntervalMinutes: number
}

export const DEFAULT_AGENDA_SCHEDULE: AgendaSchedule = {
  agendaStartTime: "08:00",
  agendaEndTime: "17:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  slotIntervalMinutes: 30,
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m ?? 0)
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function parseAgendaSchedule(source: unknown): AgendaSchedule {
  const clinic = (source ?? {}) as Partial<AgendaSchedule>
  return {
    agendaStartTime: clinic.agendaStartTime ?? DEFAULT_AGENDA_SCHEDULE.agendaStartTime,
    agendaEndTime: clinic.agendaEndTime ?? DEFAULT_AGENDA_SCHEDULE.agendaEndTime,
    lunchStartTime: clinic.lunchStartTime ?? DEFAULT_AGENDA_SCHEDULE.lunchStartTime,
    lunchEndTime: clinic.lunchEndTime ?? DEFAULT_AGENDA_SCHEDULE.lunchEndTime,
    slotIntervalMinutes: clinic.slotIntervalMinutes ?? DEFAULT_AGENDA_SCHEDULE.slotIntervalMinutes,
  }
}

export function generateAgendaSlots(schedule: AgendaSchedule): string[] {
  const start = timeToMinutes(schedule.agendaStartTime)
  const end = timeToMinutes(schedule.agendaEndTime)
  const lunchStart = timeToMinutes(schedule.lunchStartTime)
  const lunchEnd = timeToMinutes(schedule.lunchEndTime)
  const interval = schedule.slotIntervalMinutes

  const slots: string[] = []
  for (let m = start; m < end; m += interval) {
    if (m >= lunchStart && m < lunchEnd) continue
    slots.push(minutesToTime(m))
  }
  return slots
}

export type AgendaRow =
  | { kind: "slot"; time: string }
  | { kind: "lunch"; label: string; from: string; to: string }

export function buildAgendaRows(schedule: AgendaSchedule): AgendaRow[] {
  const slots = generateAgendaSlots(schedule)
  const lunchStart = timeToMinutes(schedule.lunchStartTime)
  const lunchEnd = timeToMinutes(schedule.lunchEndTime)
  const hasLunch = lunchStart < lunchEnd && lunchStart >= timeToMinutes(schedule.agendaStartTime)

  if (!hasLunch) {
    return slots.map((time) => ({ kind: "slot", time }))
  }

  const rows: AgendaRow[] = []
  let lunchInserted = false

  for (const time of slots) {
    if (!lunchInserted && timeToMinutes(time) > lunchStart) {
      rows.push({
        kind: "lunch",
        label: "Almoço",
        from: schedule.lunchStartTime,
        to: schedule.lunchEndTime,
      })
      lunchInserted = true
    }
    rows.push({ kind: "slot", time })
  }

  if (!lunchInserted) {
    rows.push({
      kind: "lunch",
      label: "Almoço",
      from: schedule.lunchStartTime,
      to: schedule.lunchEndTime,
    })
  }

  return rows
}

export function overlapsLunch(startTime: string, endTime: string, schedule: AgendaSchedule): boolean {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  const lunchStart = timeToMinutes(schedule.lunchStartTime)
  const lunchEnd = timeToMinutes(schedule.lunchEndTime)
  if (lunchStart >= lunchEnd) return false
  return start < lunchEnd && end > lunchStart
}

export function isWithinWorkHours(startTime: string, endTime: string, schedule: AgendaSchedule): boolean {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  const workStart = timeToMinutes(schedule.agendaStartTime)
  const workEnd = timeToMinutes(schedule.agendaEndTime)
  return start >= workStart && end <= workEnd && end > start
}

export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes)
}

export function normalizeTimeHHmm(time: string): string | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const min = Number(match[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/** Sobreposição real: fim de uma consulta às 15:00 NÃO bloqueia slot que começa às 15:00. */
export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return (
    timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart)
  )
}
