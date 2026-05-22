import prisma from "../src/lib/prisma.js"

const conns = await prisma.whatsappConnection.findMany({
  select: { id: true, name: true, status: true, lastError: true, phoneNumber: true, clinicId: true },
})
console.log("connections", conns)

const failed = await prisma.whatsappOutbox.findMany({
  where: { status: "FAILED" },
  take: 5,
  orderBy: { updatedAt: "desc" },
})
console.log("failed outbox", failed)

const recent = await prisma.whatsappMessage.findMany({
  orderBy: { sentAt: "desc" },
  take: 5,
  select: {
    id: true,
    fromMe: true,
    content: true,
    status: true,
    sentAt: true,
    chat: { select: { phoneDigits: true, connection: { select: { name: true, status: true } } } },
  },
})
console.log("recent messages", recent)

const settings = await prisma.clinicWhatsappSettings.findMany()
console.log("settings", settings)

const chats = await prisma.whatsappChat.findMany({
  take: 5,
  include: { connection: { select: { name: true, status: true, id: true } } },
})
console.log(
  "chats",
  chats.map((c) => ({
    phone: c.phoneDigits,
    conn: c.connection.name,
    status: c.connection.status,
    connId: c.connection.id,
  }))
)

await prisma.$disconnect()
