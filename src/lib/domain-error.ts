export class DomainError extends Error {
  readonly code: string
  readonly httpStatus: number

  constructor(code: string, message: string, httpStatus = 400) {
    super(message)
    this.name = "DomainError"
    this.code = code
    this.httpStatus = httpStatus
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export const DomainCodes = {
  NOT_FOUND: "NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  DOCTOR_NOT_ALLOWED: "DOCTOR_NOT_ALLOWED",
  CROSS_TENANT_ACCESS: "CROSS_TENANT_ACCESS",
  CLINIC_NOT_ALLOWED: "CLINIC_NOT_ALLOWED",
  INVALID_ENCOUNTER_STATE: "INVALID_ENCOUNTER_STATE",
  ENCOUNTER_ALREADY_COMPLETED: "ENCOUNTER_ALREADY_COMPLETED",
  ENCOUNTER_CLOSED: "ENCOUNTER_CLOSED",
  ENCOUNTER_NOT_COMPLETED: "ENCOUNTER_NOT_COMPLETED",
  INVALID_APPOINTMENT_STATE: "INVALID_STATUS_TRANSITION",
  INVALID_PRESCRIPTION_STATE: "INVALID_PRESCRIPTION_STATE",
  PRESCRIPTION_ALREADY_FINALIZED: "PRESCRIPTION_ALREADY_FINALIZED",
  PRESCRIPTION_NOT_FINALIZED: "NOT_FINALIZED",
  PRESCRIPTION_NOT_EDITABLE: "NOT_EDITABLE",
  SIGNATURE_PENDING: "SIGNATURE_PENDING",
  SIGNATURE_FAILED: "SIGNATURE_FAILED",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  SIGNATURE_UNSUPPORTED: "SIGNATURE_UNSUPPORTED",
  DOCUMENT_HASH_MISMATCH: "DOCUMENT_HASH_MISMATCH",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  PATIENT_REQUIRED: "PATIENT_REQUIRED",
  ADDENDUM_BODY_REQUIRED: "ADDENDUM_BODY_REQUIRED",
  NO_ITEMS: "NO_ITEMS",
} as const

export function domainErrorToHttp(error: unknown): {
  status: number
  body: { error: string; code: string }
} | null {
  if (error instanceof DomainError) {
    return {
      status: error.httpStatus,
      body: { error: error.message, code: error.code },
    }
  }
  if (!(error instanceof Error)) return null

  const mapped: Record<string, { status: number; message: string; code: string }> = {
    NOT_FOUND: { status: 404, message: "Recurso nao encontrado", code: DomainCodes.NOT_FOUND },
    PERMISSION_DENIED: { status: 403, message: "Permissao negada", code: DomainCodes.PERMISSION_DENIED },
    DOCTOR_NOT_ALLOWED: {
      status: 403,
      message: "Profissional nao permitido",
      code: DomainCodes.DOCTOR_NOT_ALLOWED,
    },
    CLINIC_NOT_ALLOWED: {
      status: 403,
      message: "Clinica nao autorizada para este usuario",
      code: DomainCodes.CLINIC_NOT_ALLOWED,
    },
    INVALID_STATUS_TRANSITION: {
      status: 409,
      message: "Transicao de status invalida",
      code: DomainCodes.INVALID_APPOINTMENT_STATE,
    },
    ENCOUNTER_CLOSED: {
      status: 409,
      message: "Atendimento finalizado. Use um adendo para registrar informacoes novas",
      code: DomainCodes.ENCOUNTER_CLOSED,
    },
    ENCOUNTER_NOT_COMPLETED: {
      status: 409,
      message: "Adendo so e permitido apos finalizar o atendimento",
      code: DomainCodes.ENCOUNTER_NOT_COMPLETED,
    },
    ADDENDUM_BODY_REQUIRED: {
      status: 400,
      message: "Informe o texto do adendo",
      code: DomainCodes.ADDENDUM_BODY_REQUIRED,
    },
    PATIENT_REQUIRED: { status: 400, message: "Agendamento sem paciente", code: DomainCodes.PATIENT_REQUIRED },
    ALREADY_FINALIZED: {
      status: 409,
      message: "Prescricao ja finalizada",
      code: DomainCodes.PRESCRIPTION_ALREADY_FINALIZED,
    },
    NOT_EDITABLE: {
      status: 409,
      message: "Prescricao nao pode ser editada neste estado",
      code: DomainCodes.PRESCRIPTION_NOT_EDITABLE,
    },
    NOT_FINALIZED: {
      status: 409,
      message: "Prescricao ainda nao foi finalizada",
      code: DomainCodes.PRESCRIPTION_NOT_FINALIZED,
    },
    VERSION_CONFLICT: {
      status: 409,
      message: "O atendimento foi alterado em outra sessao. Recarregue e tente novamente",
      code: DomainCodes.VERSION_CONFLICT,
    },
    IDEMPOTENCY_CONFLICT: {
      status: 409,
      message: "A mesma chave de idempotencia foi reutilizada com outro payload",
      code: DomainCodes.IDEMPOTENCY_CONFLICT,
    },
    NO_ITEMS: { status: 400, message: "Inclua ao menos um item na prescricao", code: DomainCodes.NO_ITEMS },
  }

  const hit = mapped[error.message]
  if (!hit) return null
  return { status: hit.status, body: { error: hit.message, code: hit.code } }
}
