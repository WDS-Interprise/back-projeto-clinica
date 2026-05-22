import "dotenv/config"
import prisma from "../src/lib/prisma.js"
import { chatCompletion, isOpenRouterConfigured } from "../src/lib/openrouter.js"
import { executeAiTool, AI_TOOLS_DOC } from "../src/services/whatsapp-ai-tools.service.js"

const chatId = "cmpg24qp6000ffhr4cpise8gx"
const clinicId = "cmpfu23tw000qfhuclznuy03t"

const chat = await prisma.whatsappChat.findUnique({
  where: { id: chatId },
  select: { aiPaused: true, aiContextJson: true },
})
const settings = await prisma.clinicWhatsappSettings.findUnique({ where: { clinicId } })
console.log("configured:", isOpenRouterConfigured())
console.log("chat:", chat)
console.log("settings:", settings)

const rows = await prisma.whatsappMessage.findMany({
  where: { chatId },
  orderBy: { sentAt: "desc" },
  take: 16,
  select: { fromMe: true, content: true },
})
const history = rows.reverse().filter((m) => m.content.trim()).map((m) => ({
  role: m.fromMe ? ("assistant" as const) : ("user" as const),
  content: m.content,
}))

const messages = [{ role: "system" as const, content: "Assistente clinica. Responda em portugues." + AI_TOOLS_DOC.slice(0, 200) }, ...history]

let stored: { reasoning_details?: unknown } = {}
try {
  stored = JSON.parse(chat?.aiContextJson ?? "{}")
} catch { /* */ }

if (stored.reasoning_details) {
  const idx = [...messages].reverse().findIndex((m) => m.role === "assistant")
  if (idx >= 0) {
    const i = messages.length - 1 - idx
    ;(messages[i] as { reasoning_details?: unknown }).reasoning_details = stored.reasoning_details
  }
}

for (let round = 0; round < 3; round++) {
  console.log(`\n--- round ${round} ---`)
  const completion = await chatCompletion({ messages, reasoning: true })
  console.log("content:", JSON.stringify(completion.content?.slice(0, 200)))
  console.log("content length:", completion.content?.length ?? 0)
  const trimmed = completion.content?.trim() ?? ""
  const toolMatch = trimmed.match(/^\{[\s\S]*\}$/) ?? trimmed.match(/\{[\s\S]*"tool"[\s\S]*\}/)
  if (toolMatch) {
    console.log("tool detected:", toolMatch[0].slice(0, 120))
    break
  }
  if (!trimmed) {
    console.log("EMPTY CONTENT - this causes null reply")
    break
  }
  break
}

await prisma.$disconnect()
