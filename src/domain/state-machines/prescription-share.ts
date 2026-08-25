export const SHARE_STATUSES = ["PENDING", "PROCESSING", "SENT", "FAILED"] as const
export type ShareMachineStatus = (typeof SHARE_STATUSES)[number]

/**
 * SENT = aceito pela sessao WhatsApp (Baileys). Nao e confirmacao de leitura
 * nem DELIVERED do dispositivo do paciente.
 */
export const SHARE_TRANSITIONS: Record<ShareMachineStatus, ShareMachineStatus[]> = {
  PENDING: ["PROCESSING", "FAILED"],
  PROCESSING: ["SENT", "FAILED"],
  SENT: [],
  FAILED: ["PENDING"],
}
