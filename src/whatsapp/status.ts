export const WHATSAPP_STATUS = {
  CREATED: "CREATED",
  WAITING_QR: "WAITING_QR",
  QR_GENERATED: "QR_GENERATED",
  WAITING_PAIRING: "WAITING_PAIRING",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  LOGGED_OUT: "LOGGED_OUT",
  ERROR: "ERROR",
} as const

export type WhatsappStatus = (typeof WHATSAPP_STATUS)[keyof typeof WHATSAPP_STATUS]

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    CREATED: "Criada",
    WAITING_QR: "Aguardando QR",
    QR_GENERATED: "QR gerado",
    WAITING_PAIRING: "Aguardando código",
    CONNECTING: "Conectando",
    CONNECTED: "Conectado",
    DISCONNECTED: "Desconectado",
    LOGGED_OUT: "Sessão encerrada",
    ERROR: "Erro",
  }
  return map[status] ?? status
}
