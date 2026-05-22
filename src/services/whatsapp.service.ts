import prisma from "@/lib/prisma.js"

const whatsappDb = prisma.whatsappConnection
if (!whatsappDb) {
  throw new Error(
    "Prisma Client desatualizado: execute npx prisma generate na pasta back-projeto-clinica e reinicie o servidor."
  )
}
import type { AuthContext } from "@/types/index.js"
import { WHATSAPP_STATUS } from "@/whatsapp/status.js"
import type { ConnectionRuntimeUpdate } from "@/whatsapp/manager.js"
import { ensureDbAuthState, clearDbAuthState } from "@/whatsapp/auth-db.js"
import {
  disconnectRuntime,
  isRuntimeActive,
  logoutRuntime,
  resumeConnectedSession,
  startPairingConnection,
  startQrConnection,
  stopRuntime,
  tearDownConnection,
  getConnectedSocket,
} from "@/whatsapp/manager.js"

function mapRow(row: {
  id: string
  clinicId: string
  userId: string
  name: string
  phoneNumber: string | null
  status: string
  connectionType: string | null
  qrCode: string | null
  pairingCode: string | null
  lastError: string | null
  lastConnectedAt: Date | null
  lastDisconnectedAt: Date | null
  createdAt: Date
  updatedAt: Date
  user?: { name: string }
}) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    userId: row.userId,
    userName: row.user?.name,
    name: row.name,
    phoneNumber: row.phoneNumber,
    status: row.status,
    connectionType: row.connectionType,
    qrCode: row.qrCode,
    pairingCode: row.pairingCode,
    lastError: row.lastError,
    lastConnectedAt: row.lastConnectedAt,
    lastDisconnectedAt: row.lastDisconnectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function assertConnectionAccess(ctx: AuthContext, connectionId: string) {
  const row = await whatsappDb.findFirst({
    where: { id: connectionId, clinicId: ctx.clinicId },
  })
  if (!row) throw new Error("NOT_FOUND")
  return row
}

function makeUpdater(connectionId: string) {
  return async (data: ConnectionRuntimeUpdate) => {
    const patch: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
    }
    if (data.qrCode !== undefined) patch.qrCode = data.qrCode
    if (data.pairingCode !== undefined) patch.pairingCode = data.pairingCode
    if (data.phoneNumber !== undefined) patch.phoneNumber = data.phoneNumber
    if (data.lastError !== undefined) patch.lastError = data.lastError
    if (data.status === WHATSAPP_STATUS.CONNECTED) {
      patch.lastConnectedAt = new Date()
      patch.lastError = null
    }
    if (
      data.status === WHATSAPP_STATUS.DISCONNECTED ||
      data.status === WHATSAPP_STATUS.LOGGED_OUT
    ) {
      patch.lastDisconnectedAt = new Date()
      patch.qrCode = null
      patch.pairingCode = null
    }
    const { count } = await whatsappDb.updateMany({
      where: { id: connectionId },
      data: patch,
    })
    if (count === 0) {
      tearDownConnection(connectionId)
    }
  }
}

function isResumableStatus(status: string, lastConnectedAt: Date | null): boolean {
  if (status === WHATSAPP_STATUS.CONNECTED) return true
  return status === WHATSAPP_STATUS.CONNECTING && lastConnectedAt != null
}

/** Reabre sessão Baileys em memória quando o banco diz CONNECTED mas o socket caiu (ex.: restart). */
export async function ensureConnectionRuntime(connectionId: string): Promise<boolean> {
  if (isRuntimeActive(connectionId)) return true

  const row = await whatsappDb.findUnique({
    where: { id: connectionId },
    select: { status: true, name: true, lastConnectedAt: true },
  })
  if (!row || !isResumableStatus(row.status, row.lastConnectedAt)) return false

  try {
    await resumeConnectedSession(connectionId, makeUpdater(connectionId))
    for (let i = 0; i < 40; i++) {
      if (isRuntimeActive(connectionId) && getConnectedSocket(connectionId)) return true
      await new Promise((r) => setTimeout(r, 500))
    }
    return isRuntimeActive(connectionId) && !!getConnectedSocket(connectionId)
  } catch (err) {
    console.error(`[WhatsApp] falha ao retomar runtime ${row?.name ?? connectionId}:`, err)
    return false
  }
}

/** Retoma sockets Baileys para conexões com sessão salva (CONNECTED ou CONNECTING travado). */
export async function resumeWhatsappSessionsOnBoot() {
  const rows = await whatsappDb.findMany({
    where: {
      OR: [
        { status: WHATSAPP_STATUS.CONNECTED },
        {
          status: WHATSAPP_STATUS.CONNECTING,
          lastConnectedAt: { not: null },
        },
      ],
    },
    select: { id: true, name: true, status: true },
  })
  for (const row of rows) {
    if (isRuntimeActive(row.id)) continue
    const ok = await ensureConnectionRuntime(row.id)
    if (ok) {
      console.log(`[WhatsApp] sessão retomada: ${row.name} (${row.id})`)
    } else if (row.status === WHATSAPP_STATUS.CONNECTING) {
      console.warn(`[WhatsApp] não foi possível retomar ${row.name} — reconecte em Configurações`)
    }
  }
}

export async function listConnections(ctx: AuthContext) {
  const rows = await whatsappDb.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  })
  return rows.map((r) => mapRow(r))
}

export async function createConnection(
  ctx: AuthContext,
  data: { name: string; connectionType?: "QR" | "PAIRING" }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const row = await whatsappDb.create({
    data: {
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      name: data.name.trim(),
      status: WHATSAPP_STATUS.CREATED,
      connectionType: data.connectionType ?? null,
    },
    include: { user: { select: { name: true } } },
  })
  await ensureDbAuthState(row.id)
  return mapRow(row)
}

export async function getConnectionStatus(ctx: AuthContext, connectionId: string) {
  const row = await assertConnectionAccess(ctx, connectionId)
  return mapRow({ ...row, user: undefined })
}

export async function startQr(ctx: AuthContext, connectionId: string) {
  const row = await assertConnectionAccess(ctx, connectionId)
  await whatsappDb.update({
    where: { id: row.id },
    data: {
      connectionType: "QR",
      status: WHATSAPP_STATUS.WAITING_QR,
      qrCode: null,
      pairingCode: null,
      lastError: null,
    },
  })
  const updater = makeUpdater(connectionId)
  void startQrConnection(connectionId, updater).catch(async (err) => {
    await updater({
      status: WHATSAPP_STATUS.ERROR,
      lastError: err instanceof Error ? err.message : "Erro ao iniciar QR",
    })
  })
  return getConnectionStatus(ctx, connectionId)
}

export async function startPairing(
  ctx: AuthContext,
  connectionId: string,
  phoneNumber: string
) {
  const row = await assertConnectionAccess(ctx, connectionId)
  await whatsappDb.update({
    where: { id: row.id },
    data: {
      connectionType: "PAIRING",
      status: WHATSAPP_STATUS.WAITING_PAIRING,
      qrCode: null,
      pairingCode: null,
      lastError: null,
      phoneNumber: phoneNumber.replace(/\D/g, ""),
    },
  })
  const updater = makeUpdater(connectionId)
  try {
    await startPairingConnection(connectionId, phoneNumber, updater)
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_PHONE") {
      throw err
    }
    await updater({
      status: WHATSAPP_STATUS.ERROR,
      lastError: err instanceof Error ? err.message : "Erro ao gerar código",
    })
    throw err
  }
  return getConnectionStatus(ctx, connectionId)
}

export async function disconnect(ctx: AuthContext, connectionId: string) {
  await assertConnectionAccess(ctx, connectionId)
  stopRuntime(connectionId)
  await whatsappDb.update({
    where: { id: connectionId },
    data: {
      status: WHATSAPP_STATUS.DISCONNECTED,
      lastDisconnectedAt: new Date(),
      qrCode: null,
      pairingCode: null,
    },
  })
  return getConnectionStatus(ctx, connectionId)
}

export async function logout(ctx: AuthContext, connectionId: string) {
  await assertConnectionAccess(ctx, connectionId)
  await logoutRuntime(connectionId)
  await whatsappDb.update({
    where: { id: connectionId },
    data: {
      status: WHATSAPP_STATUS.LOGGED_OUT,
      lastDisconnectedAt: new Date(),
      qrCode: null,
      pairingCode: null,
      phoneNumber: null,
    },
  })
  return getConnectionStatus(ctx, connectionId)
}

export async function removeConnection(ctx: AuthContext, connectionId: string) {
  const row = await assertConnectionAccess(ctx, connectionId)
  tearDownConnection(connectionId)
  await clearDbAuthState(connectionId)
  await prisma.clinicWhatsappSettings.updateMany({
    where: { clinicId: row.clinicId, defaultConnectionId: connectionId },
    data: { defaultConnectionId: null },
  })
  await whatsappDb.delete({ where: { id: connectionId } })
}
