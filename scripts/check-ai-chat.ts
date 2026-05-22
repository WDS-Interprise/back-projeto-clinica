import prisma from "../src/lib/prisma.js"
import { isOpenRouterConfigured } from "../src/lib/openrouter.js"

const chatId = "cmpg24qp6000ffhr4cpise8gx"
const chat = await prisma.whatsappChat.findUnique({
  where: { id: chatId },
  include: {
    connection: { select: { id: true, name: true, status: true } },
    messages: { orderBy: { sentAt: "desc" }, take: 5 },
  },
})
const settings = chat
  ? await prisma.clinicWhatsappSettings.findUnique({ where: { clinicId: chat.clinicId } })
  : null

console.log(
  JSON.stringify(
    {
      openRouterConfigured: isOpenRouterConfigured(),
      chat: chat
        ? {
            id: chat.id,
            aiPaused: chat.aiPaused,
            remoteJid: chat.remoteJid,
            phoneDigits: chat.phoneDigits,
            patientId: chat.patientId,
            connection: chat.connection,
            recentMessages: chat.messages.map((m) => ({
              fromMe: m.fromMe,
              content: m.content.slice(0, 80),
              sentAt: m.sentAt,
            })),
          }
        : null,
      settings: settings
        ? {
            aiAssistantEnabled: settings.aiAssistantEnabled,
            aiAutoReplyEnabled: settings.aiAutoReplyEnabled,
          }
        : null,
    },
    null,
    2
  )
)

await prisma.$disconnect()
