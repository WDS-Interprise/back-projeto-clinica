import prisma from "@/lib/prisma.js"
import {
  chatCompletion,
  isOpenRouterConfigured,
  type OpenRouterMessage,
} from "@/lib/openrouter.js"
import { AI_TOOLS_DOC, executeAiTool, type AiToolContext } from "@/services/whatsapp-ai-tools.service.js"
import { sendMessageNow } from "@/services/whatsapp-messaging.service.js"

const MAX_TOOL_ROUNDS = 10
const MAX_HISTORY = 16
const processingChats = new Set<string>()
const pendingByChat = new Map<string, Parameters<typeof handleInboundForAi>[0]>()

type ToolCall = { tool: string; args: Record<string, unknown> }

function extractJsonObjects(text: string): string[] {
  const objects: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && text[i] !== "{") i++
    if (i >= text.length) break

    let depth = 0
    const start = i
    for (; i < text.length; i++) {
      const ch = text[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          objects.push(text.slice(start, i + 1))
          i++
          break
        }
      }
    }
    if (depth !== 0) break
  }
  return objects
}

function parseToolCallObject(raw: string): ToolCall | null {
  try {
    const parsed = JSON.parse(raw) as { tool?: string; args?: Record<string, unknown> }
    if (parsed.tool && typeof parsed.tool === "string") {
      return { tool: parsed.tool, args: parsed.args ?? {} }
    }
  } catch {
    /* not a tool call */
  }
  return null
}

function parseToolCalls(content: string | null): ToolCall[] {
  if (!content?.trim()) return []

  const trimmed = content.trim()
  const single = parseToolCallObject(trimmed)
  if (single) return [single]

  const calls: ToolCall[] = []
  for (const raw of extractJsonObjects(trimmed)) {
    const call = parseToolCallObject(raw)
    if (call) calls.push(call)
  }
  return calls
}

function stripToolCallsFromText(content: string): string {
  let rest = content.trim()
  while (rest.startsWith("{")) {
    let depth = 0
    let end = -1
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end === -1) break
    const raw = rest.slice(0, end + 1)
    if (!parseToolCallObject(raw)) break
    rest = rest.slice(end + 1).trim()
  }
  return rest.trim()
}

function containsLeakedToolJson(text: string): boolean {
  return /\{"tool"\s*:\s*"[^"]+"/.test(text)
}

async function buildSystemPrompt(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { name: true },
  })
  const today = new Date().toISOString().slice(0, 10)
  return `Você é a assistente virtual da clínica "${clinic?.name ?? "ClinMax"}" no WhatsApp.

Data de hoje: ${today} (use formato brasileiro dd/mm/aaaa nas respostas).

Suas funções:
- Atender pacientes com cordialidade e objetividade
- Cadastrar pacientes novos OU reconhecer cadastro existente (por CPF)
- Consultar e agendar consultas na agenda — você confirma diretamente, sem repassar à recepção
- Informar horários disponíveis e consultas marcadas
- Enviar lembretes de consulta quando solicitado
- Notificar médicos sobre agendamentos
- Reenviar prescrições já finalizadas pelo médico (PDF no WhatsApp) — você NÃO prescreve medicamentos; só envia receitas existentes

Fluxo para agendar consulta (obrigatório):
1. Colete: nome, CPF, telefone, e-mail (opcional). Data de nascimento e sexo são desejáveis mas não bloqueiam o cadastro
2. Use buscar_paciente_cpf com o CPF informado
3. Se não encontrar → use resolver_paciente com todos os dados para criar o cadastro na hora
4. Se encontrar → cumprimente pelo nome e use o paciente existente
5. Confirme médico, data e horário; use buscar_horarios se necessário
6. Use agendar_consulta e confirme: "Sua consulta está agendada para..."

Ao informar horários disponíveis:
- Use buscar_horarios e leia horarios + intervaloMinutos (duração real de cada slot)
- Se o paciente pedir horário específico ("às 15:00", "15h"), use verificar_horario ANTES de responder
- Se verificar_horario retornar disponivel: true, confirme que ESTÁ disponível — nunca diga indisponível
- Consulta que TERMINA às 15:00 NÃO ocupa slot que COMEÇA às 15:00 (são horários consecutivos válidos)
- Se o dia estiver livre, ofereça opções de manhã E tarde — nunca cite só 08:00
- Pergunte qual horário o paciente prefere antes de agendar

Regras:
- NUNCA diga que "a recepção vai cadastrar" ou "em breve confirmaremos" — você cadastra e confirma na hora
- Se o CPF já existir, cumprimente pelo nome e prossiga com o agendamento
- Respostas curtas, adequadas ao WhatsApp (máx. ~3 parágrafos)
- Nunca invente horários: use buscar_horarios ou listar_consultas_*
- Horários no formato HH:mm (24h)
- Idioma: português do Brasil
- Para chamar ferramenta: responda SOMENTE com um JSON {"tool":"...","args":{...}} por mensagem (nunca misture JSON com texto ao paciente)
- Só confirme agendamento DEPOIS que agendar_consulta retornar sucesso: true

${AI_TOOLS_DOC}`
}

async function loadConversationHistory(chatId: string): Promise<OpenRouterMessage[]> {
  const rows = await prisma.whatsappMessage.findMany({
    where: { chatId },
    orderBy: { sentAt: "desc" },
    take: MAX_HISTORY,
    select: { fromMe: true, content: true },
  })
  return rows
    .reverse()
    .map((m) => ({
      role: m.fromMe ? ("assistant" as const) : ("user" as const),
      content: m.fromMe ? stripToolCallsFromText(m.content) : m.content,
    }))
    .filter((m) => m.content.trim())
}

async function callModel(messages: OpenRouterMessage[]) {
  return chatCompletion({ messages, reasoning: false })
}

function looksLikeInternalReasoning(text: string): boolean {
  return /^(we need|let's|i need|first,|the user wants)/i.test(text.trim())
}

function shouldAutoEnableClinicAi(): boolean {
  const flag = process.env.WHATSAPP_AI_AUTO_ENABLE?.trim().toLowerCase()
  if (flag === "false" || flag === "0" || flag === "no") return false
  return isOpenRouterConfigured()
}

/** Ativa assistente + auto-resposta quando OpenRouter está configurado (padrão em dev). */
export async function ensureClinicAiEnabled(clinicId: string): Promise<boolean> {
  if (!shouldAutoEnableClinicAi()) return false

  const settings = await prisma.clinicWhatsappSettings.upsert({
    where: { clinicId },
    create: {
      clinicId,
      aiAssistantEnabled: true,
      aiAutoReplyEnabled: true,
    },
    update: {},
  })

  if (settings.aiAssistantEnabled && settings.aiAutoReplyEnabled) return true

  await prisma.clinicWhatsappSettings.update({
    where: { clinicId },
    data: { aiAssistantEnabled: true, aiAutoReplyEnabled: true },
  })
  console.log("[WhatsApp AI] assistente ativado automaticamente na clínica:", clinicId)
  return true
}

export async function generateAiReply(params: {
  clinicId: string
  connectionId: string
  chatId: string
  phoneDigits: string
  patientId: string | null
  inboundText: string
}): Promise<string | null> {
  if (!isOpenRouterConfigured()) {
    console.warn("[WhatsApp AI] OPENROUTER_API_KEY não configurada")
    return null
  }

  const chat = await prisma.whatsappChat.findUnique({
    where: { id: params.chatId },
    select: { aiPaused: true },
  })
  if (!chat || chat.aiPaused) {
    console.warn("[WhatsApp AI] IA pausada ou chat não encontrado:", params.chatId)
    return null
  }

  const settings = await prisma.clinicWhatsappSettings.findUnique({
    where: { clinicId: params.clinicId },
  })
  if (!settings?.aiAssistantEnabled || !settings.aiAutoReplyEnabled) {
    console.warn("[WhatsApp AI] assistente desabilitado na clínica:", params.clinicId)
    return null
  }

  await prisma.whatsappChat.update({
    where: { id: params.chatId },
    data: { aiContextJson: null },
  })

  const systemPrompt = await buildSystemPrompt(params.clinicId)
  const history = await loadConversationHistory(params.chatId)

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ]

  const toolCtx: AiToolContext = {
    clinicId: params.clinicId,
    connectionId: params.connectionId,
    chatId: params.chatId,
    phoneDigits: params.phoneDigits,
    patientId: params.patientId,
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await callModel(messages)
    let reply = completion.content?.trim() ?? ""

    const rawContent = reply || completion.content || ""
    const toolCalls = parseToolCalls(rawContent)
    if (toolCalls.length > 0) {
      messages.push({ role: "assistant", content: rawContent })
      for (const toolCall of toolCalls) {
        console.log(`[WhatsApp AI] tool ${toolCall.tool} (chat ${params.chatId})`)
        const result = await executeAiTool(toolCall.tool, toolCall.args, toolCtx)
        messages.push({
          role: "user",
          content: `[resultado da ferramenta ${toolCall.tool}]: ${result}`,
        })
      }
      continue
    }

    const cleanReply = stripToolCallsFromText(rawContent)
    if (cleanReply) reply = cleanReply

    if (!reply || looksLikeInternalReasoning(reply) || containsLeakedToolJson(reply)) {
      console.warn("[WhatsApp AI] resposta inválida, tentando novamente (chat", params.chatId, ")")
      messages.push({
        role: "user",
        content:
          "Responda em português do Brasil para o paciente no WhatsApp, de forma curta. Se precisar usar ferramenta, responda SOMENTE com JSON {\"tool\":\"...\",\"args\":{...}} (um por vez, sem texto junto).",
      })
      continue
    }

    return reply
  }

  return "Desculpe, não consegui concluir sua solicitação. Um atendente humano vai ajudá-lo em breve."
}

async function processInboundQueue(chatId: string) {
  while (pendingByChat.has(chatId)) {
    const params = pendingByChat.get(chatId)!
    pendingByChat.delete(chatId)

    try {
      console.log("[WhatsApp AI] processando:", chatId, params.inboundText.slice(0, 60))
      const reply = await generateAiReply(params)
      if (!reply) continue

      await sendMessageNow({
        clinicId: params.clinicId,
        connectionId: params.connectionId,
        remoteJid: params.remoteJid,
        to: params.phoneDigits,
        body: reply,
        patientId: params.patientId,
      })
      console.log("[WhatsApp AI] resposta enviada:", chatId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[WhatsApp AI] erro ao responder:", msg, err)
    }
  }
  processingChats.delete(chatId)
}

export async function handleInboundForAi(params: {
  connectionId: string
  clinicId: string
  chatId: string
  remoteJid: string
  phoneDigits: string
  patientId: string | null
  inboundText: string
}) {
  const text = params.inboundText.trim()
  if (!text) return

  await ensureClinicAiEnabled(params.clinicId)

  await prisma.whatsappChat.updateMany({
    where: { id: params.chatId, clinicId: params.clinicId, aiPaused: true },
    data: { aiPaused: false },
  })

  pendingByChat.set(params.chatId, { ...params, inboundText: text })
  if (processingChats.has(params.chatId)) return

  processingChats.add(params.chatId)
  void processInboundQueue(params.chatId)
}

export async function setChatAiPaused(chatId: string, clinicId: string, paused: boolean) {
  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, clinicId },
  })
  if (!chat) throw new Error("NOT_FOUND")
  return prisma.whatsappChat.update({
    where: { id: chatId },
    data: { aiPaused: paused },
  })
}
