import { Mutex } from "async-mutex"
import { initAuthCreds, proto, type AuthenticationState } from "@whiskeysockets/baileys"
import { BufferJSON } from "@whiskeysockets/baileys"
import prisma from "@/lib/prisma.js"

type StoredAuth = {
  creds: AuthenticationState["creds"]
  keys: Record<string, unknown>
}

const locks = new Map<string, Mutex>()

function lockFor(connectionId: string) {
  let m = locks.get(connectionId)
  if (!m) {
    m = new Mutex()
    locks.set(connectionId, m)
  }
  return m
}

function parseAuthData(raw: string): StoredAuth {
  try {
    const parsed = JSON.parse(raw, BufferJSON.reviver) as Partial<StoredAuth>
    return {
      creds: parsed.creds ?? initAuthCreds(),
      keys: (parsed.keys as Record<string, unknown>) ?? {},
    }
  } catch {
    return { creds: initAuthCreds(), keys: {} }
  }
}

async function loadStored(connectionId: string): Promise<StoredAuth> {
  const row = await prisma.whatsappAuthState.findUnique({
    where: { connectionId },
  })
  if (!row) return { creds: initAuthCreds(), keys: {} }
  return parseAuthData(row.authData)
}

async function saveStored(connectionId: string, data: StoredAuth) {
  const authData = JSON.stringify(data, BufferJSON.replacer)
  await prisma.whatsappAuthState.upsert({
    where: { connectionId },
    create: { connectionId, authData },
    update: { authData },
  })
}

export async function ensureDbAuthState(connectionId: string) {
  await prisma.whatsappAuthState.upsert({
    where: { connectionId },
    create: { connectionId, authData: "{}" },
    update: {},
  })
}

export async function clearDbAuthState(connectionId: string) {
  await prisma.whatsappAuthState.upsert({
    where: { connectionId },
    create: { connectionId, authData: "{}" },
    update: { authData: "{}" },
  })
}

export async function useDbAuthState(connectionId: string) {
  await ensureDbAuthState(connectionId)
  const stored = await loadStored(connectionId)
  const creds = stored.creds

  const persist = async () => {
    const mutex = lockFor(connectionId)
    await mutex.runExclusive(async () => {
      const current = await loadStored(connectionId)
      current.creds = creds
      await saveStored(connectionId, current)
    })
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, unknown> = {}
          const current = await loadStored(connectionId)
          await Promise.all(
            ids.map(async (id) => {
              let value = current.keys[`${type}-${id}`]
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object)
              }
              data[id] = value ?? null
            })
          )
          return data
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          const mutex = lockFor(connectionId)
          await mutex.runExclusive(async () => {
            const current = await loadStored(connectionId)
            for (const category in data) {
              for (const id in data[category]) {
                const value = data[category][id]
                const key = `${category}-${id}`
                if (value) current.keys[key] = value
                else delete current.keys[key]
              }
            }
            current.creds = creds
            await saveStored(connectionId, current)
          })
        },
      },
    },
    saveCreds: persist,
  }
}
