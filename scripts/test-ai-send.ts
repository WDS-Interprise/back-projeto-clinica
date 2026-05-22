import "dotenv/config"
import { generateAiReply } from "../src/services/whatsapp-ai.service.js"

const reply = await generateAiReply({
  clinicId: "cmpfu23tw000qfhuclznuy03t",
  connectionId: "cmpg0hauc0001fh48xgnu8wi6",
  chatId: "cmpg24qp6000ffhr4cpise8gx",
  phoneDigits: "267473970569223",
  patientId: null,
  inboundText: "ola poderia terminar minha consulta?",
})
console.log("REPLY:", reply?.slice(0, 400))
