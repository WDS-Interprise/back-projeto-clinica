import { DomainError, DomainCodes } from "@/lib/domain-error.js"

export const ENCOUNTER_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const
export type EncounterMachineStatus = (typeof ENCOUNTER_STATUSES)[number]

/**
 * Semantica:
 * - NOT_STARTED: valor legado no enum. Novos atendimentos nascem IN_PROGRESS.
 * - IN_PROGRESS: evolucao editavel, autosave permitido.
 * - COMPLETED: evolucao original imutavel. Correcao so via EncounterAddendum.
 * - CANCELLED: atendimento abortado com o agendamento. Sem reabertura.
 *
 * Nao ha DRAFT/VOIDED: o produto nao possui rascunho separado nem anulacao juridica.
 */
export const ENCOUNTER_TRANSITIONS: Record<EncounterMachineStatus, EncounterMachineStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
}

export const ENCOUNTER_TERMINAL: EncounterMachineStatus[] = ["COMPLETED", "CANCELLED"]

export function isEncounterEditable(status: EncounterMachineStatus): boolean {
  return status === "IN_PROGRESS" || status === "NOT_STARTED"
}

export function assertEncounterTransition(from: EncounterMachineStatus, to: EncounterMachineStatus) {
  if (from === to) return
  const allowed = ENCOUNTER_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new DomainError(
      DomainCodes.INVALID_ENCOUNTER_STATE,
      `Transicao de atendimento invalida: ${from} -> ${to}`,
      409
    )
  }
}

export function assertEncounterCanEdit(status: EncounterMachineStatus) {
  if (!isEncounterEditable(status)) {
    throw new DomainError(
      DomainCodes.ENCOUNTER_CLOSED,
      "Atendimento finalizado. Use um adendo para registrar informacoes novas",
      409
    )
  }
}

export function assertEncounterCanAddendum(status: EncounterMachineStatus) {
  if (status !== "COMPLETED") {
    throw new DomainError(
      DomainCodes.ENCOUNTER_NOT_COMPLETED,
      "Adendo so e permitido apos finalizar o atendimento",
      409
    )
  }
}

export function encounterCompleteIsIdempotent(status: EncounterMachineStatus): boolean {
  return status === "COMPLETED"
}
