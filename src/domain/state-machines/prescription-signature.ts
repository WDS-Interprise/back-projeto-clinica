import { DomainError, DomainCodes } from "@/lib/domain-error.js"

export const SIGNATURE_STATUSES = [
  "NONE",
  "PENDING",
  "PROCESSING",
  "SIMULATED",
  "SIGNED",
  "FAILED",
  "CANCELLED",
  "REVOKED",
] as const
export type SignatureMachineStatus = (typeof SIGNATURE_STATUSES)[number]

/**
 * SIGNED so e permitido quando ha evidencia criptografica (provider != STUB).
 * STUB termina em SIMULATED, nunca em SIGNED.
 */
export const SIGNATURE_TRANSITIONS: Record<SignatureMachineStatus, SignatureMachineStatus[]> = {
  NONE: ["PENDING", "SIMULATED"],
  PENDING: ["PROCESSING", "SIMULATED", "FAILED", "CANCELLED"],
  PROCESSING: ["SIGNED", "FAILED", "CANCELLED"],
  SIMULATED: ["CANCELLED"],
  SIGNED: ["REVOKED"],
  FAILED: ["PENDING", "CANCELLED"],
  CANCELLED: [],
  REVOKED: [],
}

export function assertSignatureTransition(from: SignatureMachineStatus, to: SignatureMachineStatus) {
  if (from === to) return
  const allowed = SIGNATURE_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new DomainError(
      DomainCodes.SIGNATURE_INVALID,
      `Transicao de assinatura invalida: ${from} -> ${to}`,
      409
    )
  }
}

export function canMarkCryptographicallySigned(input: {
  provider: string
  isCryptographic: boolean
  documentHash?: string | null
}): boolean {
  if (!input.isCryptographic) return false
  if (!input.documentHash) return false
  if (input.provider === "STUB" || input.provider === "NONE") return false
  return true
}

export function assertCanMarkSigned(input: {
  provider: string
  isCryptographic: boolean
  documentHash?: string | null
}) {
  if (!canMarkCryptographicallySigned(input)) {
    throw new DomainError(
      DomainCodes.SIGNATURE_INVALID,
      "Nao e permitido marcar SIGNED sem evidencia criptografica do documento",
      409
    )
  }
}
