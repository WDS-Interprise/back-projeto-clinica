export type AiMode = "MANUAL" | "SUGGEST" | "AUTO_REPLY" | "AUTO_ACTIONS"

export type AiPermissionKey =
  | "answerQuestions"
  | "shareAddressHours"
  | "listDoctors"
  | "querySchedule"
  | "offerSlots"
  | "createPatient"
  | "bookAppointment"
  | "rescheduleAppointment"
  | "cancelAppointment"
  | "confirmAppointment"
  | "sendReminders"
  | "sendPrescriptions"
  | "sharePrices"
  | "createCharge"
  | "queryPayment"

export type AiPermissions = Record<AiPermissionKey, boolean>

export const AI_PERMISSION_KEYS: AiPermissionKey[] = [
  "answerQuestions",
  "shareAddressHours",
  "listDoctors",
  "querySchedule",
  "offerSlots",
  "createPatient",
  "bookAppointment",
  "rescheduleAppointment",
  "cancelAppointment",
  "confirmAppointment",
  "sendReminders",
  "sendPrescriptions",
  "sharePrices",
  "createCharge",
  "queryPayment",
]

export const DEFAULT_AI_PERMISSIONS: AiPermissions = {
  answerQuestions: true,
  shareAddressHours: true,
  listDoctors: true,
  querySchedule: true,
  offerSlots: true,
  createPatient: true,
  bookAppointment: true,
  rescheduleAppointment: true,
  cancelAppointment: false,
  confirmAppointment: true,
  sendReminders: true,
  sendPrescriptions: true,
  sharePrices: false,
  createCharge: false,
  queryPayment: false,
}

/** Ferramenta da IA → permissão exigida */
export const TOOL_PERMISSION_MAP: Record<string, AiPermissionKey> = {
  info_clinica: "shareAddressHours",
  listar_medicos: "listDoctors",
  listar_procedimentos: "listDoctors",
  buscar_horarios: "offerSlots",
  verificar_horario: "querySchedule",
  listar_consultas_paciente: "querySchedule",
  listar_consultas_medico: "querySchedule",
  buscar_paciente: "answerQuestions",
  buscar_paciente_cpf: "answerQuestions",
  buscar_paciente_nome: "answerQuestions",
  resolver_paciente: "createPatient",
  criar_paciente: "createPatient",
  agendar_consulta: "bookAppointment",
  enviar_lembrete_consulta: "sendReminders",
  listar_prescricoes_paciente: "answerQuestions",
  enviar_prescricao_whatsapp: "sendPrescriptions",
  notificar_medico: "answerQuestions",
}

export function parseAiPermissions(raw: string | null | undefined): AiPermissions {
  const base = { ...DEFAULT_AI_PERMISSIONS }
  if (!raw?.trim()) return base
  try {
    const parsed = JSON.parse(raw) as Partial<AiPermissions>
    for (const key of AI_PERMISSION_KEYS) {
      if (typeof parsed[key] === "boolean") base[key] = parsed[key]!
    }
  } catch {
    /* default */
  }
  return base
}

export function stringifyAiPermissions(perms: AiPermissions): string {
  return JSON.stringify(perms)
}

export function isToolAllowed(tool: string, perms: AiPermissions): boolean {
  const required = TOOL_PERMISSION_MAP[tool]
  if (!required) return true
  return perms[required] === true
}

export function buildAiToolsDoc(perms: AiPermissions): string {
  const lines: string[] = [
    "Ferramentas (uma por vez; JSON puro: {\"tool\":\"NOME\",\"args\":{...}}):",
    "",
  ]

  const sections: Array<{ title: string; tools: Array<{ name: string; perm: AiPermissionKey; doc: string }> }> = [
    {
      title: "Cadastro",
      tools: [
        { name: "buscar_paciente_cpf", perm: "answerQuestions", doc: "- buscar_paciente_cpf. { cpf }" },
        { name: "buscar_paciente", perm: "answerQuestions", doc: "- buscar_paciente. pelo telefone do chat" },
        { name: "buscar_paciente_nome", perm: "answerQuestions", doc: "- buscar_paciente_nome. { nome }" },
        { name: "resolver_paciente", perm: "createPatient", doc: "- resolver_paciente. { cpf, nome, telefone, dataNascimento, sexo, email? }" },
        { name: "criar_paciente", perm: "createPatient", doc: "- criar_paciente. igual resolver_paciente" },
      ],
    },
    {
      title: "Agenda",
      tools: [
        { name: "listar_medicos", perm: "listDoctors", doc: "- listar_medicos. { nome? }" },
        { name: "buscar_horarios", perm: "offerSlots", doc: "- buscar_horarios. { doctorId, date: YYYY-MM-DD }" },
        { name: "verificar_horario", perm: "querySchedule", doc: "- verificar_horario. { doctorId, date, startTime }" },
        {
          name: "agendar_consulta",
          perm: "bookAppointment",
          doc: "- agendar_consulta. { doctorId, date, startTime, confirmacao: true, patientId?, cpf?, remarcar?, appointmentId? }",
        },
      ],
    },
    {
      title: "Prescrições",
      tools: [
        { name: "listar_prescricoes_paciente", perm: "answerQuestions", doc: "- listar_prescricoes_paciente. { patientId?, cpf? }" },
        { name: "enviar_prescricao_whatsapp", perm: "sendPrescriptions", doc: "- enviar_prescricao_whatsapp. { prescriptionId }" },
      ],
    },
    {
      title: "Outros",
      tools: [
        { name: "enviar_lembrete_consulta", perm: "sendReminders", doc: "- enviar_lembrete_consulta. { appointmentId }" },
        { name: "info_clinica", perm: "shareAddressHours", doc: "- info_clinica. sem args" },
      ],
    },
  ]

  for (const section of sections) {
    const enabled = section.tools.filter((t) => perms[t.perm])
    if (enabled.length === 0) continue
    lines.push(`${section.title}:`)
    for (const t of enabled) lines.push(t.doc)
    lines.push("")
  }

  lines.push("Não existe ferramenta de envio de e-mail. Para e-mail, use resolver_paciente com email.")
  return lines.join("\n").trim()
}

export function aiModeFromLegacy(
  aiAssistantEnabled: boolean,
  aiAutoReplyEnabled: boolean
): AiMode {
  if (!aiAssistantEnabled) return "MANUAL"
  if (aiAssistantEnabled && !aiAutoReplyEnabled) return "SUGGEST"
  return "AUTO_ACTIONS"
}

export function legacyFlagsFromAiMode(mode: AiMode): {
  aiAssistantEnabled: boolean
  aiAutoReplyEnabled: boolean
} {
  switch (mode) {
    case "MANUAL":
      return { aiAssistantEnabled: false, aiAutoReplyEnabled: false }
    case "SUGGEST":
      return { aiAssistantEnabled: true, aiAutoReplyEnabled: false }
    case "AUTO_REPLY":
      return { aiAssistantEnabled: true, aiAutoReplyEnabled: true }
    case "AUTO_ACTIONS":
      return { aiAssistantEnabled: true, aiAutoReplyEnabled: true }
    default:
      return { aiAssistantEnabled: false, aiAutoReplyEnabled: false }
  }
}

export function canExecuteToolInMode(mode: AiMode, tool: string): boolean {
  const actionTools = new Set([
    "criar_paciente",
    "resolver_paciente",
    "agendar_consulta",
    "enviar_lembrete_consulta",
    "enviar_prescricao_whatsapp",
  ])
  if (mode === "AUTO_REPLY" && actionTools.has(tool)) return false
  return true
}
