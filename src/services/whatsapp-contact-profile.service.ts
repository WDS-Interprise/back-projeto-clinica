import prisma from "@/lib/prisma.js"
import { getConnectedSocket } from "@/whatsapp/manager.js"

const PROFILE_TTL_MS = 12 * 60 * 60 * 1000
const SYNC_BATCH = 8

function isProfileStale(fetchedAt: Date | null | undefined) {
  if (!fetchedAt) return true
  return Date.now() - fetchedAt.getTime() > PROFILE_TTL_MS
}

export async function fetchProfilePictureBuffer(
  connectionId: string,
  remoteJid: string
): Promise<Buffer | null> {
  const sock = getConnectedSocket(connectionId)
  if (!sock) return null

  try {
    const url = await sock.profilePictureUrl(remoteJid, "image")
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export async function refreshChatProfile(chatId: string): Promise<void> {
  const chat = await prisma.whatsappChat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      connectionId: true,
      remoteJid: true,
      profilePictureFetchedAt: true,
    },
  })
  if (!chat || !isProfileStale(chat.profilePictureFetchedAt)) return

  const sock = getConnectedSocket(chat.connectionId)
  if (!sock) return

  let profilePictureUrl: string | null = null
  try {
    profilePictureUrl = (await sock.profilePictureUrl(chat.remoteJid, "image")) ?? null
  } catch {
    profilePictureUrl = null
  }

  try {
    await prisma.whatsappChat.update({
      where: { id: chat.id },
      data: {
        profilePictureUrl,
        profilePictureFetchedAt: new Date(),
      },
    })
  } catch (err) {
    console.warn("[WhatsApp] não foi possível salvar foto de perfil (rode prisma generate):", err)
  }
}

export function scheduleChatsProfileSync(
  chats: { id: string; profilePictureFetchedAt: Date | null }[]
) {
  const stale = chats.filter((c) => isProfileStale(c.profilePictureFetchedAt))
  const batch = stale.slice(0, SYNC_BATCH)
  for (const c of batch) {
    void refreshChatProfile(c.id).catch(() => {
      /* ignore — avatar endpoint tenta de novo */
    })
  }
}

export async function getChatAvatarBuffer(
  clinicId: string,
  chatId: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, clinicId },
    select: { connectionId: true, remoteJid: true, profilePictureUrl: true },
  })
  if (!chat) return null

  if (chat.profilePictureUrl) {
    try {
      const res = await fetch(chat.profilePictureUrl)
      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "image/jpeg"
        return { buffer: Buffer.from(await res.arrayBuffer()), contentType }
      }
    } catch {
      /* tenta via socket */
    }
  }

  const buffer = await fetchProfilePictureBuffer(chat.connectionId, chat.remoteJid)
  if (!buffer) return null

  void prisma.whatsappChat
    .update({
      where: { id: chatId },
      data: { profilePictureFetchedAt: new Date() },
    })
    .catch((err) => {
      console.warn("[WhatsApp] avatar cache update:", err)
    })

  return { buffer, contentType: "image/jpeg" }
}

export async function updateChatContactName(
  chatId: string,
  contactName: string | null | undefined
) {
  const name = contactName?.trim()
  if (!name) return
  await prisma.whatsappChat.updateMany({
    where: { id: chatId, OR: [{ contactName: null }, { contactName: "" }] },
    data: { contactName: name },
  })
}
