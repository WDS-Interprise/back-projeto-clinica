import { DomainError, DomainCodes } from "@/lib/domain-error.js"

export const PRESCRIPTION_STATUSES = ["DRAFT", "FINALIZED", "CANCELLED"] as const
export type PrescriptionMachineStatus = (typeof PRESCRIPTION_STATUSES)[number]

/**
 * Estado da prescricao (conteudo) e independente do estado da assinatura.
 * DRAFT: itens editaveis.
 * FINALIZED: snapshot congelado. Nao volta para DRAFT.
 * CANCELLED: terminal, sem reuso. Renovar cria outro DRAFT.
 */
export const PRESCRIPTION_TRANSITIONS: Record<PrescriptionMachineStatus, PrescriptionMachineStatus[]> = {
  DRAFT: ["FINALIZED", "CANCELLED"],
  FINALIZED: ["CANCELLED"],
  CANCELLED: [],
}

export function assertPrescriptionTransition(
  from: PrescriptionMachineStatus,
  to: PrescriptionMachineStatus
) {
  if (from === to) return
  const allowed = PRESCRIPTION_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new DomainError(
      DomainCodes.INVALID_PRESCRIPTION_STATE,
      `Transicao de prescricao invalida: ${from} -> ${to}`,
      409
    )
  }
}

export function assertPrescriptionEditable(status: PrescriptionMachineStatus) {
  if (status !== "DRAFT") {
    throw new DomainError(
      DomainCodes.PRESCRIPTION_NOT_EDITABLE,
      "Prescricao nao pode ser editada neste estado",
      409
    )
  }
}

export function prescriptionFinalizeIsIdempotent(status: PrescriptionMachineStatus): boolean {
  return status === "FINALIZED"
}
