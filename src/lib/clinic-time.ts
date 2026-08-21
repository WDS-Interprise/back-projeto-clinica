/** Fuso padrão das clínicas no Brasil (Brasília, UTC-3). */
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE?.trim() || "America/Sao_Paulo"

export const CLINIC_TIMEZONE_LABEL =
  process.env.CLINIC_TIMEZONE_LABEL?.trim() || "Horário de Brasília"

function clinicDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  }
}

/** Data de hoje no fuso da clínica (YYYY-MM-DD). */
export function clinicTodayIso(now = new Date()): string {
  const { year, month, day } = clinicDateParts(now)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Horário atual no fuso da clínica (HH:mm). */
export function clinicNowClock(now = new Date()): string {
  const { hour, minute } = clinicDateParts(now)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Minutos desde meia-noite no fuso da clínica. */
export function clinicNowMinutes(now = new Date()): number {
  const { hour, minute } = clinicDateParts(now)
  return hour * 60 + minute
}

export type ClinicDayPeriod = "morning" | "afternoon" | "evening" | "night"

/** Período do dia para tom de conversa (manhã, tarde, noite). */
export function clinicDayPeriod(now = new Date()): ClinicDayPeriod {
  const minutes = clinicNowMinutes(now)
  if (minutes < 12 * 60) return "morning"
  if (minutes < 18 * 60) return "afternoon"
  if (minutes < 22 * 60) return "evening"
  return "night"
}

export function clinicDayPeriodLabel(period: ClinicDayPeriod): string {
  switch (period) {
    case "morning":
      return "manhã"
    case "afternoon":
      return "tarde"
    case "evening":
      return "início da noite"
    case "night":
      return "noite"
  }
}

/** Saudação adequada ao horário da clínica (não copie a do paciente). */
export function clinicGreeting(now = new Date()): string {
  const period = clinicDayPeriod(now)
  if (period === "morning") return "Bom dia"
  if (period === "afternoon") return "Boa tarde"
  return "Boa noite"
}

/** Soma dias à data de referência no calendário da clínica. */
export function clinicAddDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  return clinicTodayIso(utc)
}
