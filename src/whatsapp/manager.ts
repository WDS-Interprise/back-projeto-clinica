import QRCode from "qrcode"
import makeWASocket, {
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import pino from "pino"
import prisma from "@/lib/prisma.js"
import { WHATSAPP_STATUS, type WhatsappStatus } from "./status.js"
import { clearDbAuthState, useDbAuthState } from "./auth-db.js"
import { handleMessagesUpsert } from "./message-store.js"
import { normalizeWhatsappPhone, phoneToJid, resolveOutboundJid, tryNormalizeWhatsappPhone } from "./phone.js"

export { normalizeWhatsappPhone } from "./phone.js"

type RuntimeSession = {
  sock: WASocket
  mode: "qr" | "pairing"
}

const runtime = new Map<string, RuntimeSession>()
const sessionMode = new Map<string, "qr" | "pairing">()
const reconnecting = new Set<string>()
const reconnectAttempts = new Map<string, number>()
/** Conexões removidas/excluídas — handlers Baileys não devem mais persistir no banco. */
const tornDownConnections = new Set<string>()
const MAX_RECONNECT_ATTEMPTS = 8

export type ConnectionRuntimeUpdate = {
  status: WhatsappStatus
  qrCode?: string | null
  pairingCode?: string | null
  phoneNumber?: string | null
  lastError?: string | null
}

async function patchConnection(
  connectionId: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>,
  data: ConnectionRuntimeUpdate
) {
  if (tornDownConnections.has(connectionId)) return
  await onUpdate(data)
}

/** Encerra runtime e impede updates no banco (ex.: antes de excluir a conexão). */
export function tearDownConnection(connectionId: string) {
  tornDownConnections.add(connectionId)
  stopRuntime(connectionId)
}

function getStatusCode(lastDisconnect: unknown): number | undefined {
  return (lastDisconnect as Boom | undefined)?.output?.statusCode
}

/** Após escanear o QR o WhatsApp envia close com restartRequired (515) — é esperado. */
function shouldAutoReconnect(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return true
  if (statusCode === DisconnectReason.loggedOut) return false
  if (statusCode === DisconnectReason.forbidden) return false
  if (statusCode === DisconnectReason.badSession) return false
  if (statusCode === DisconnectReason.multideviceMismatch) return false
  return true
}

export function stopRuntime(connectionId: string) {
  reconnecting.delete(connectionId)
  sessionMode.delete(connectionId)
  const active = runtime.get(connectionId)
  if (active) {
    try {
      active.sock.end(undefined)
    } catch {
      /* ignore */
    }
    runtime.delete(connectionId)
  }
}

async function waitSocketOpen(sock: WASocket, timeoutMs = 30_000) {
  const sockWithWait = sock as WASocket & { waitForSocketOpen?: () => Promise<void> }
  if (typeof sockWithWait.waitForSocketOpen === "function") {
    await Promise.race([
      sockWithWait.waitForSocketOpen(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout aguardando WhatsApp")), timeoutMs)
      ),
    ])
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout aguardando WhatsApp")),
      timeoutMs
    )
    const onUpdate = (update: { connection?: string }) => {
      if (update.connection === "open") {
        clearTimeout(timer)
        sock.ev.off("connection.update", onUpdate)
        resolve()
      }
    }
    sock.ev.on("connection.update", onUpdate)
  })
}

async function createSocket(connectionId: string, resetAuth = false) {
  if (resetAuth) await clearDbAuthState(connectionId)
  const { state, saveCreds } = await useDbAuthState(connectionId)
  const { version } = await fetchLatestBaileysVersion()
  const logger = pino({ level: "silent" })

  const sock = makeWASocket({
    version,
    auth: state as Parameters<typeof makeWASocket>[0]["auth"],
    logger,
    printQRInTerminal: false,
    browser: ["ClinMax", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on("creds.update", saveCreds)
  return sock
}

function bindMessageHandlers(connectionId: string, sock: WASocket) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return
    try {
      const conn = await prisma.whatsappConnection.findUnique({
        where: { id: connectionId },
        select: { clinicId: true, status: true },
      })
      if (!conn?.clinicId) return
      await handleMessagesUpsert(connectionId, conn.clinicId, messages)
    } catch {
      /* evita derrubar o socket */
    }
  })
}

export function getConnectedSocket(connectionId: string): WASocket | null {
  const entry = runtime.get(connectionId)
  if (!entry) return null
  return entry.sock
}

export async function sendTextMessage(
  connectionId: string,
  destination: string,
  text: string
): Promise<{ jid: string; messageId?: string }> {
  const sock = getConnectedSocket(connectionId)
  if (!sock) throw new Error("WHATSAPP_SOCKET_OFFLINE")

  await waitSocketOpen(sock)

  const jid = resolveOutboundJid({ to: destination, remoteJid: destination.includes("@") ? destination : undefined })

  const result = await sock.sendMessage(jid, { text })
  return { jid, messageId: result?.key?.id ?? undefined }
}

export async function sendDocumentMessage(
  connectionId: string,
  destination: string,
  buffer: Buffer,
  opts: { fileName: string; mimetype: string; caption?: string }
): Promise<{ jid: string; messageId?: string }> {
  const sock = getConnectedSocket(connectionId)
  if (!sock) throw new Error("WHATSAPP_SOCKET_OFFLINE")

  await waitSocketOpen(sock)

  const jid = resolveOutboundJid({ to: destination, remoteJid: destination.includes("@") ? destination : undefined })

  const result = await sock.sendMessage(jid, {
    document: buffer,
    mimetype: opts.mimetype,
    fileName: opts.fileName,
    caption: opts.caption,
  })
  return { jid, messageId: result?.key?.id ?? undefined }
}

function scheduleReconnect(
  connectionId: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>,
  statusCode: number | undefined
) {
  if (reconnecting.has(connectionId)) return

  const attempts = (reconnectAttempts.get(connectionId) ?? 0) + 1
  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    void patchConnection(connectionId, onUpdate, {
      status: WHATSAPP_STATUS.ERROR,
      qrCode: null,
      pairingCode: null,
      lastError: "Muitas tentativas de reconexão. Gere um novo QR Code.",
    })
    return
  }
  reconnectAttempts.set(connectionId, attempts)
  reconnecting.add(connectionId)

  const waitMs =
    statusCode === DisconnectReason.restartRequired ? 800 : 2500

  void (async () => {
    await delay(waitMs)
    if (!reconnecting.has(connectionId) || tornDownConnections.has(connectionId)) return
    try {
      const mode = sessionMode.get(connectionId) ?? "qr"
      await openWhatsAppSession(connectionId, onUpdate, { mode, reconnect: true })
    } catch (err) {
      reconnecting.delete(connectionId)
      const msg = err instanceof Error ? err.message : "Erro ao reconectar"
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.ERROR,
        lastError: msg,
      })
    }
  })()
}

function bindConnectionHandlers(
  connectionId: string,
  sock: WASocket,
  mode: "qr" | "pairing",
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>,
  options?: { defaultPhone?: string }
) {
  sock.ev.on("connection.update", async (update) => {
    if (tornDownConnections.has(connectionId)) return
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 })
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.QR_GENERATED,
        qrCode: qrDataUrl,
        pairingCode: null,
        lastError: null,
      })
    }

    if (connection === "connecting") {
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.CONNECTING,
        lastError: null,
      })
    }

    if (connection === "open") {
      reconnecting.delete(connectionId)
      reconnectAttempts.set(connectionId, 0)
      const jid = sock.user?.id ?? ""
      const phone =
        jid.split(":")[0]?.replace(/\D/g, "") || options?.defaultPhone || null
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.CONNECTED,
        phoneNumber: phone,
        qrCode: null,
        pairingCode: null,
        lastError: null,
      })
    }

    if (connection === "close") {
      const statusCode = getStatusCode(lastDisconnect?.error)
      const loggedOut = statusCode === DisconnectReason.loggedOut

      runtime.delete(connectionId)

      if (loggedOut) {
        reconnecting.delete(connectionId)
        await patchConnection(connectionId, onUpdate, {
          status: WHATSAPP_STATUS.LOGGED_OUT,
          qrCode: null,
          pairingCode: null,
          lastError: null,
        })
        return
      }

      if (statusCode === DisconnectReason.badSession) {
        reconnecting.delete(connectionId)
        await clearDbAuthState(connectionId)
        await patchConnection(connectionId, onUpdate, {
          status: WHATSAPP_STATUS.ERROR,
          qrCode: null,
          pairingCode: null,
          lastError: "Sessão inválida. Gere um novo QR Code.",
        })
        return
      }

      if (shouldAutoReconnect(statusCode)) {
        await patchConnection(connectionId, onUpdate, {
          status: WHATSAPP_STATUS.CONNECTING,
          qrCode: mode === "qr" ? undefined : null,
          pairingCode: mode === "pairing" ? undefined : null,
          lastError: null,
        })
        scheduleReconnect(connectionId, onUpdate, statusCode)
        return
      }

      reconnecting.delete(connectionId)
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.DISCONNECTED,
        qrCode: null,
        pairingCode: null,
        lastError: "Conexão fechada",
      })
    }
  })
}

async function openWhatsAppSession(
  connectionId: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>,
  opts: {
    mode: "qr" | "pairing"
    resetAuth?: boolean
    reconnect?: boolean
    defaultPhone?: string
  }
) {
  if (!opts.reconnect) {
    stopRuntime(connectionId)
    reconnectAttempts.set(connectionId, 0)
  } else {
    const active = runtime.get(connectionId)
    if (active) {
      try {
        active.sock.end(undefined)
      } catch {
        /* ignore */
      }
      runtime.delete(connectionId)
    }
  }

  if (opts.mode === "qr" && !opts.reconnect) {
    await patchConnection(connectionId, onUpdate, {
      status: WHATSAPP_STATUS.WAITING_QR,
      qrCode: null,
      pairingCode: null,
      lastError: null,
    })
  }

  const sock = await createSocket(connectionId, opts.resetAuth ?? false)
  bindConnectionHandlers(connectionId, sock, opts.mode, onUpdate, {
    defaultPhone: opts.defaultPhone,
  })
  bindMessageHandlers(connectionId, sock)
  sessionMode.set(connectionId, opts.mode)
  runtime.set(connectionId, { sock, mode: opts.mode })
  reconnecting.delete(connectionId)
}

export async function startQrConnection(
  connectionId: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>
) {
  await openWhatsAppSession(connectionId, onUpdate, { mode: "qr" })
}

export async function startPairingConnection(
  connectionId: string,
  phoneNumber: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>
) {
  stopRuntime(connectionId)
  const digits = normalizeWhatsappPhone(phoneNumber)

  await patchConnection(connectionId, onUpdate, {
    status: WHATSAPP_STATUS.WAITING_PAIRING,
    qrCode: null,
    pairingCode: null,
    phoneNumber: digits,
    lastError: null,
  })

  await openWhatsAppSession(connectionId, onUpdate, {
    mode: "pairing",
    resetAuth: true,
    defaultPhone: digits,
  })

  const entry = runtime.get(connectionId)
  if (!entry) throw new Error("Sessão não iniciada")

  try {
    await waitSocketOpen(entry.sock)
    const sock = entry.sock
    if (sock.authState.creds.registered) {
      await clearDbAuthState(connectionId)
      stopRuntime(connectionId)
      await openWhatsAppSession(connectionId, onUpdate, {
        mode: "pairing",
        resetAuth: true,
        defaultPhone: digits,
      })
      const again = runtime.get(connectionId)
      if (!again) throw new Error("Sessão não iniciada")
      await waitSocketOpen(again.sock)
      const code = await again.sock.requestPairingCode(digits)
      await patchConnection(connectionId, onUpdate, {
        status: WHATSAPP_STATUS.WAITING_PAIRING,
        pairingCode: code,
        qrCode: null,
      })
      return
    }
    const code = await sock.requestPairingCode(digits)
    await patchConnection(connectionId, onUpdate, {
      status: WHATSAPP_STATUS.WAITING_PAIRING,
      pairingCode: code,
      qrCode: null,
    })
  } catch (err) {
    stopRuntime(connectionId)
    const msg = err instanceof Error ? err.message : "Erro ao gerar código"
    await patchConnection(connectionId, onUpdate, {
      status: WHATSAPP_STATUS.ERROR,
      lastError: msg,
    })
    throw err
  }
}

/** Reabre sessão Baileys após reinício do servidor (auth já no banco). */
export async function resumeConnectedSession(
  connectionId: string,
  onUpdate: (data: ConnectionRuntimeUpdate) => Promise<void>
) {
  await openWhatsAppSession(connectionId, onUpdate, { mode: "qr", reconnect: true })
}

export async function disconnectRuntime(connectionId: string) {
  stopRuntime(connectionId)
}

export async function logoutRuntime(connectionId: string) {
  const active = runtime.get(connectionId)
  if (active) {
    try {
      await active.sock.logout()
    } catch {
      /* ignore */
    }
    stopRuntime(connectionId)
  }
  await clearDbAuthState(connectionId)
}

export function isRuntimeActive(connectionId: string) {
  return runtime.has(connectionId)
}

/** @deprecated sessão agora fica no banco; mantido para compatibilidade de chamadas */
export async function removeSessionFiles(_connectionId: string) {
  /* noop */
}
