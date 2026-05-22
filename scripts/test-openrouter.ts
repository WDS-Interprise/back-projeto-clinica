import "dotenv/config"
import { chatCompletion } from "../src/lib/openrouter.js"
import { generateAiReply } from "../src/services/whatsapp-ai.service.js"

console.log("=== Teste OpenRouter simples ===")
try {
  const r = await chatCompletion({
    messages: [{ role: "user", content: "Responda apenas: ok" }],
    reasoning: true,
  })
  console.log("content:", JSON.stringify(r.content))
  console.log("reasoning_details:", r.reasoning_details ? "presente" : "ausente")
} catch (e) {
  console.error("OpenRouter falhou:", e)
}

console.log("\n=== Teste generateAiReply ===")
try {
  const reply = await generateAiReply({
    clinicId: "cmpfu23tw000qfhuclznuy03t",
    connectionId: "cmpg0hauc0001fh48xgnu8wi6",
    chatId: "cmpg24qp6000ffhr4cpise8gx",
    phoneDigits: "267473970569223",
    patientId: null,
    inboundText: "ola ?",
  })
  console.log("reply:", reply)
} catch (e) {
  console.error("generateAiReply falhou:", e)
}
