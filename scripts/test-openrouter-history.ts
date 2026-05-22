import "dotenv/config"
import prisma from "../src/lib/prisma.js"
import { chatCompletion } from "../src/lib/openrouter.js"

const rows = await prisma.whatsappMessage.findMany({
  where: { chatId: "cmpg24qp6000ffhr4cpise8gx" },
  orderBy: { sentAt: "desc" },
  take: 10,
  select: { fromMe: true, content: true },
})

const messages = [
  { role: "system" as const, content: "Responda em portugues de forma curta." },
  ...rows
    .reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({
      role: m.fromMe ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
]

const r = await chatCompletion({ messages, reasoning: true })
console.log("content:", JSON.stringify(r.content))
console.log("length:", r.content?.length ?? 0)

await prisma.$disconnect()
