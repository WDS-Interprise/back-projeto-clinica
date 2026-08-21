import { chatCompletionWithFallback, isOpenRouterConfigured } from "@/lib/openrouter.js"
import { getById as getAppointmentById } from "@/services/appointment.service.js"
import {
  getById as getEncounterById,
  listRecentByPatient,
} from "@/services/encounter.service.js"
import type { AuthContext } from "@/types/index.js"

export type AttendanceAiDraft = {
  mainComplaint: string
  currentIllnessHistory: string
  physicalExam: string
  historyAndAntecedents: string
  conduct: string
  prescriptionSummary: string
  notes: string
  cidHint: string
  hypotheses: string
  possibleConducts: string
  summary: string
}

const EMPTY: AttendanceAiDraft = {
  mainComplaint: "",
  currentIllnessHistory: "",
  physicalExam: "",
  historyAndAntecedents: "",
  conduct: "",
  prescriptionSummary: "",
  notes: "",
  cidHint: "",
  hypotheses: "",
  possibleConducts: "",
  summary: "",
}

function parseDraft(raw: string): AttendanceAiDraft {
  const cleaned = raw.replace(/```json|```/gi, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start < 0 || end <= start) return EMPTY
  try {
    const json = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
    const text = (key: keyof AttendanceAiDraft) => String(json[key] ?? "").trim()
    return {
      mainComplaint: text("mainComplaint"),
      currentIllnessHistory: text("currentIllnessHistory"),
      physicalExam: text("physicalExam"),
      historyAndAntecedents: text("historyAndAntecedents"),
      conduct: text("conduct"),
      prescriptionSummary: text("prescriptionSummary"),
      notes: text("notes"),
      cidHint: text("cidHint"),
      hypotheses: text("hypotheses"),
      possibleConducts: text("possibleConducts"),
      summary: text("summary"),
    }
  } catch {
    return EMPTY
  }
}

async function runDraftPrompt(payload: Record<string, unknown>) {
  if (!isOpenRouterConfigured()) {
    throw new Error("OPENROUTER_NOT_CONFIGURED")
  }

  const result = await chatCompletionWithFallback({
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente clínico do ClinMax. Ajuda o profissional a redigir o prontuário. " +
          "Não invente sinais vitais, exames, alergias, medicamentos ou CID definitivo. " +
          "Hipóteses e condutas são sugestões que exigem confirmação médica. Nada entra sozinho no prontuário. " +
          "Responda SOMENTE um JSON com as chaves: mainComplaint, currentIllnessHistory, physicalExam, " +
          "historyAndAntecedents, conduct, prescriptionSummary, notes, cidHint, hypotheses, possibleConducts, summary. " +
          "Textos em português do Brasil. cidHint é só sugestão textual, nunca diagnóstico fechado.",
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
  })

  return parseDraft(result.content ?? "")
}

export async function suggestAttendanceDraft(ctx: AuthContext, appointmentId: string) {
  const apt = await getAppointmentById(ctx, appointmentId)
  if (!apt) throw new Error("NOT_FOUND")

  return runDraftPrompt({
    paciente: apt.patient?.name ?? null,
    convenio: apt.insurancePlan ?? null,
    horario: `${apt.startTime ?? apt.time} ${apt.endTime ?? ""}`.trim(),
    alergias: (apt.patient as { allergies?: string } | null | undefined)?.allergies ?? null,
    medicamentos: (apt.patient as { medications?: string } | null | undefined)?.medications ?? null,
    camposAtuais: {
      mainComplaint: apt.mainComplaint,
      currentIllnessHistory: apt.currentIllnessHistory,
      physicalExam: apt.physicalExam,
      historyAndAntecedents: apt.historyAndAntecedents,
      conduct: apt.conduct,
      prescriptionSummary: apt.prescriptionSummary,
      notes: apt.notes,
      cidCode: apt.cidCode,
      cidDescription: apt.cidDescription,
    },
  })
}

export async function suggestAttendanceDraftForEncounter(ctx: AuthContext, encounterId: string) {
  const encounter = await getEncounterById(ctx, encounterId)
  if (!encounter) throw new Error("NOT_FOUND")

  const recent = await listRecentByPatient(ctx, encounter.patientId, 5)

  return runDraftPrompt({
    paciente: encounter.patient?.name ?? null,
    convenio: encounter.appointment?.insurancePlan ?? null,
    horario: encounter.appointment
      ? `${encounter.appointment.startTime} ${encounter.appointment.endTime}`.trim()
      : null,
    alergias: encounter.patient?.allergies ?? null,
    medicamentos: encounter.patient?.medications ?? null,
    atendimentosAnteriores: recent.map((r) => ({
      data: r.startedAt,
      queixa: r.mainComplaint,
      cid: r.cidCode,
      medico: r.doctor?.name,
    })),
    camposAtuais: {
      mainComplaint: encounter.mainComplaint,
      currentIllnessHistory: encounter.currentIllnessHistory,
      physicalExam: encounter.physicalExam,
      historyAndAntecedents: encounter.historyAndAntecedents,
      conduct: encounter.conduct,
      prescriptionSummary: encounter.prescriptionSummary,
      notes: encounter.notes,
      cidCode: encounter.cidCode,
      cidDescription: encounter.cidDescription,
    },
  })
}
