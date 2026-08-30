import prisma from "@/lib/prisma.js"
import {
  assertClinicFeature,
  assertClinicLimit,
  incrementAiUsage,
} from "@/lib/plan-entitlements.js"
import {
  chatCompletionWithFallback,
  isOpenRouterConfigured,
  isRetryableOpenRouterError,
  type OpenRouterMessage,
} from "@/lib/openrouter.js"
import { executeAiTool, type AiToolContext } from "@/services/whatsapp-ai-tools.service.js"
import { buildWhatsappAiSystemPrompt } from "@/lib/whatsapp-ai-prompt.js"
import {
  CLINIC_TIMEZONE_LABEL,
  clinicDayPeriod,
  clinicDayPeriodLabel,
  clinicGreeting,
  clinicNowClock,
  clinicTodayIso,
} from "@/lib/clinic-time.js"
import {
  buildTimeAwareGreetingReply,
  looksLikePureGreeting,
} from "@/lib/whatsapp-greeting.js"
import {
  parseAiPermissions,
  buildAiToolsDoc,
  aiModeFromLegacy,
  type AiMode,
} from "@/lib/ai-permissions.js"
import {
  formatContextForPrompt,
  handoffExpired,
  parseAiContext,
  stringifyAiContext,
  stripInternalContextLeak,
} from "@/lib/whatsapp-ai-context.js"
import { tryDeterministicBooking } from "@/services/whatsapp-booking-orchestrator.js"
import { tryDeterministicSatisfaction } from "@/services/whatsapp-satisfaction-orchestrator.js"
import { sendMessageNow } from "@/services/whatsapp-messaging.service.js"
import {
  markChatAiComposing,
  sendComposingIndicator,
  sendPausedPresence,
} from "@/whatsapp/presence.js"

const MAX_TOOL_ROUNDS = 10
const MAX_HISTORY = 16
const MAX_REPLY_CHARS = 1200
const INBOUND_DEBOUNCE_MS = Number(process.env.WHATSAPP_AI_DEBOUNCE_MS ?? 2000)
const processingChats = new Set<string>()
const pendingByChat = new Map<string, Parameters<typeof handleInboundForAi>[0]>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const composingIntervals = new Map<string, ReturnType<typeof setInterval>>()

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

function containsLeakedInternals(text: string): boolean {
  return (
    /buscar_horarios|resolver_paciente|verificar_horario|agendar_consulta|listar_medicos/i.test(
      text
    ) ||
    /\bferramenta\b|sistema\s+retornou|usei\s+a\s+/i.test(text) ||
    /API\b|JSON\b/i.test(text) ||
    /BLOCO INTERNO|Estado operacional|fonte da ClinMax/i.test(text) ||
    /\bpatientId\s*=/i.test(text) ||
    /\bawaitingConfirmation\s*=/i.test(text)
  )
}

async function buildSystemPrompt(clinicId: string): Promise<string> {
  const [clinic, settings] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true },
    }),
    prisma.clinicWhatsappSettings.findUnique({ where: { clinicId } }),
  ])
  const today = clinicTodayIso()
  const perms = parseAiPermissions(settings?.aiPermissionsJson)
  const toolsDoc = buildAiToolsDoc(perms)
  return `${buildWhatsappAiSystemPrompt(
    clinic?.name ?? "ClinMax",
    today,
    clinicNowClock(),
    CLINIC_TIMEZONE_LABEL,
    clinicDayPeriodLabel(clinicDayPeriod()),
    clinicGreeting()
  )}\n\n${toolsDoc}`
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
      content: m.fromMe
        ? stripInternalContextLeak(stripToolCallsFromText(m.content))
        : m.content,
    }))
    .filter((m) => m.content.trim())
}

async function callModel(messages: OpenRouterMessage[]) {
  return chatCompletionWithFallback({ messages, reasoning: false })
}

const AI_UNAVAILABLE_REPLY =
  "Desculpe, no momento não consegui processar sua mensagem (instabilidade do serviço de IA). Por favor, tente novamente em alguns minutos ou aguarde um atendente."

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
  try {
    await assertClinicFeature(params.clinicId, "WHATSAPP_AI")
    await assertClinicLimit(params.clinicId, "maxAiAutomationActionsPerMonth")
  } catch {
    console.warn("[WhatsApp AI] plano não inclui IA ou limite atingido:", params.clinicId)
    return null
  }

  const chat = await prisma.whatsappChat.findUnique({
    where: { id: params.chatId },
    select: { aiPaused: true, aiContextJson: true },
  })
  if (!chat || chat.aiPaused) {
    console.warn("[WhatsApp AI] IA pausada ou chat não encontrado:", params.chatId)
    return null
  }

  const settings = await prisma.clinicWhatsappSettings.findUnique({
    where: { clinicId: params.clinicId },
  })
  const aiMode =
    (settings?.aiMode as AiMode) ??
    aiModeFromLegacy(settings?.aiAssistantEnabled ?? false, settings?.aiAutoReplyEnabled ?? false)

  if (aiMode === "MANUAL") {
    console.warn("[WhatsApp AI] modo manual, IA não responde:", params.clinicId)
    return null
  }
  if (!settings?.aiAssistantEnabled && aiMode !== "SUGGEST") {
    console.warn("[WhatsApp AI] assistente desabilitado na clínica:", params.clinicId)
    return null
  }

  const deterministic = await tryDeterministicBooking(params)
  if (deterministic) return truncateForWhatsapp(deterministic)

  const satisfaction = await tryDeterministicSatisfaction({
    clinicId: params.clinicId,
    chatId: params.chatId,
    inboundText: params.inboundText,
  })
  if (satisfaction) return truncateForWhatsapp(satisfaction)

  const bookingCtxEarly = parseAiContext(
    (
      await prisma.whatsappChat.findUnique({
        where: { id: params.chatId },
        select: { aiContextJson: true },
      })
    )?.aiContextJson
  )
  const idleBooking =
    !bookingCtxEarly.intent ||
    bookingCtxEarly.bookingState === "IDLE" ||
    bookingCtxEarly.bookingState === undefined
  if (idleBooking && looksLikePureGreeting(params.inboundText)) {
    return truncateForWhatsapp(buildTimeAwareGreetingReply(Boolean(params.patientId)))
  }

  if (!isOpenRouterConfigured()) {
    console.warn("[WhatsApp AI] OPENROUTER_API_KEY não configurada")
    return null
  }

  const bookingCtx = parseAiContext(
    (
      await prisma.whatsappChat.findUnique({
        where: { id: params.chatId },
        select: { aiContextJson: true },
      })
    )?.aiContextJson
  )
  const contextBlock = formatContextForPrompt(bookingCtx)

  const systemPrompt = await buildSystemPrompt(params.clinicId)
  const history = await loadConversationHistory(params.chatId)

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: contextBlock
        ? `${systemPrompt}\n\n${contextBlock}`
        : systemPrompt,
    },
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
        let result: string
        try {
          result = await executeAiTool(toolCall.tool, toolCall.args, toolCtx)
          await incrementAiUsage(params.clinicId, "action")
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro interno"
          console.error(`[WhatsApp AI] tool ${toolCall.tool} falhou:`, err)
          result = JSON.stringify({ sucesso: false, erro: msg })
        }
        console.log(`[WhatsApp AI] tool ${toolCall.tool} resultado:`, result.slice(0, 400))
        messages.push({
          role: "user",
          content: `[resultado da ferramenta ${toolCall.tool}]: ${result}`,
        })
      }
      continue
    }

    const cleanReply = stripInternalContextLeak(stripToolCallsFromText(rawContent))
    if (cleanReply) reply = cleanReply

    if (!reply || looksLikeInternalReasoning(reply) || containsLeakedToolJson(reply)) {
      console.warn("[WhatsApp AI] resposta inválida, tentando novamente (chat", params.chatId, ")")
      messages.push({
        role: "user",
        content:
          "Reescreva para o paciente: português correto, frases curtas, sem citar ferramentas/API/nomes internos. Se for usar sistema, só JSON {\"tool\":\"...\",\"args\":{...}} separado.",
      })
      continue
    }

    if (containsLeakedInternals(reply)) {
      const stripped = stripInternalContextLeak(reply)
      if (stripped && !containsLeakedInternals(stripped) && !containsLeakedToolJson(stripped)) {
        return truncateForWhatsapp(stripped)
      }
      messages.push({
        role: "user",
        content:
          "Sua última resposta vazou texto interno. Reescreva SÓ a mensagem ao paciente, sem ids, intent, patientId ou bloco interno.",
      })
      continue
    }

    await incrementAiUsage(params.clinicId, "message")
    return truncateForWhatsapp(reply)
  }

  return "Desculpe, não consegui concluir sua solicitação. Um atendente humano vai ajudá-lo em breve."
}

function truncateForWhatsapp(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_REPLY_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_REPLY_CHARS - 1)}…`
}

export function isChatAiComposing(chatId: string): boolean {
  return composingIntervals.has(chatId) || processingChats.has(chatId)
}

function startComposingLoop(params: {
  connectionId: string
  remoteJid: string
  phoneDigits: string
  chatId: string
}) {
  stopComposingLoop(params.chatId)
  markChatAiComposing(params.chatId, true)
  void sendComposingIndicator(params.connectionId, params.phoneDigits, params.remoteJid)
  const interval = setInterval(() => {
    void sendComposingIndicator(params.connectionId, params.phoneDigits, params.remoteJid)
  }, 4000)
  composingIntervals.set(params.chatId, interval)
}

function stopComposingLoop(chatId: string) {
  const interval = composingIntervals.get(chatId)
  if (interval) clearInterval(interval)
  composingIntervals.delete(chatId)
  markChatAiComposing(chatId, false)
}

async function processInboundQueue(chatId: string) {
  while (pendingByChat.has(chatId)) {
    const params = pendingByChat.get(chatId)!
    pendingByChat.delete(chatId)

    const chat = await prisma.whatsappChat.findUnique({
      where: { id: chatId },
      select: { aiPaused: true, aiContextJson: true },
    })
    if (!chat) continue
    if (chat.aiPaused) {
      const ctx = parseAiContext(chat.aiContextJson)
      if (!handoffExpired(ctx)) {
        console.warn("[WhatsApp AI] conversa em HUMAN_HANDOFF, não responde:", chatId)
        continue
      }
      await prisma.whatsappChat.update({
        where: { id: chatId },
        data: {
          aiPaused: false,
          aiContextJson: stringifyAiContext({ ...ctx, mode: "BOT_ACTIVE", pausedAt: undefined }),
        },
      })
    }

    startComposingLoop({
      connectionId: params.connectionId,
      remoteJid: params.remoteJid,
      phoneDigits: params.phoneDigits,
      chatId,
    })

    try {
      console.log("[WhatsApp AI] processando:", chatId, params.inboundText.slice(0, 60))
      const reply = await generateAiReply(params)
      if (!reply) continue

      const settings = await prisma.clinicWhatsappSettings.findUnique({
        where: { clinicId: params.clinicId },
      })
      const aiMode =
        (settings?.aiMode as AiMode) ??
        aiModeFromLegacy(settings?.aiAssistantEnabled ?? false, settings?.aiAutoReplyEnabled ?? false)

      stopComposingLoop(chatId)

      if (aiMode === "SUGGEST") {
        const ctx = parseAiContext(
          (
            await prisma.whatsappChat.findUnique({
              where: { id: chatId },
              select: { aiContextJson: true },
            })
          )?.aiContextJson
        )
        await prisma.whatsappChat.update({
          where: { id: chatId },
          data: {
            aiContextJson: stringifyAiContext({ ...ctx, pendingSuggestion: reply }),
          },
        })
        console.log("[WhatsApp AI] sugestão salva (modo SUGGEST):", chatId)
        continue
      }

      await sendMessageNow({
        clinicId: params.clinicId,
        connectionId: params.connectionId,
        remoteJid: params.remoteJid,
        to: params.phoneDigits,
        body: reply,
        patientId: params.patientId,
        showTyping: true,
      })
      console.log("[WhatsApp AI] resposta enviada:", chatId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[WhatsApp AI] erro ao responder:", msg, err)

      if (isRetryableOpenRouterError(err) || msg.includes("OPENROUTER")) {
        try {
          stopComposingLoop(chatId)
          await sendMessageNow({
            clinicId: params.clinicId,
            connectionId: params.connectionId,
            remoteJid: params.remoteJid,
            to: params.phoneDigits,
            body: AI_UNAVAILABLE_REPLY,
            patientId: params.patientId,
            showTyping: false,
          })
          console.log("[WhatsApp AI] aviso de indisponibilidade enviado:", chatId)
        } catch (sendErr) {
          console.error("[WhatsApp AI] falha ao enviar aviso:", sendErr)
        }
      }
    } finally {
      stopComposingLoop(chatId)
      await sendPausedPresence(
        params.connectionId,
        params.phoneDigits,
        params.remoteJid
      ).catch(() => undefined)
    }
  }
  processingChats.delete(chatId)
}

function scheduleAiProcessing(chatId: string) {
  const existing = debounceTimers.get(chatId)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    chatId,
    setTimeout(() => {
      debounceTimers.delete(chatId)
      if (processingChats.has(chatId)) return
      processingChats.add(chatId)
      void processInboundQueue(chatId)
    }, INBOUND_DEBOUNCE_MS)
  )
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

  const chat = await prisma.whatsappChat.findUnique({
    where: { id: params.chatId },
    select: { aiPaused: true, aiContextJson: true },
  })
  if (chat?.aiPaused) {
    const ctx = parseAiContext(chat.aiContextJson)
    if (handoffExpired(ctx)) {
      await prisma.whatsappChat.update({
        where: { id: params.chatId },
        data: {
          aiPaused: false,
          aiContextJson: stringifyAiContext({ ...ctx, mode: "BOT_ACTIVE", pausedAt: undefined }),
        },
      })
      console.log("[WhatsApp AI] handoff expirou, IA retomou:", params.chatId)
    } else {
      console.log("[WhatsApp AI] HUMAN_HANDOFF ativo:", params.chatId)
      return
    }
  }

  const prev = pendingByChat.get(params.chatId)
  const mergedText = prev?.inboundText ? `${prev.inboundText}\n${text}` : text
  pendingByChat.set(params.chatId, { ...params, inboundText: mergedText })

  scheduleAiProcessing(params.chatId)
}

export async function setChatAiPaused(chatId: string, clinicId: string, paused: boolean) {
  const chat = await prisma.whatsappChat.findFirst({
    where: { id: chatId, clinicId },
  })
  if (!chat) throw new Error("NOT_FOUND")
  const ctx = parseAiContext(chat.aiContextJson)
  return prisma.whatsappChat.update({
    where: { id: chatId },
    data: {
      aiPaused: paused,
      aiContextJson: stringifyAiContext({
        ...ctx,
        mode: paused ? "HUMAN_HANDOFF" : "BOT_ACTIVE",
        pausedAt: paused ? new Date().toISOString() : undefined,
      }),
    },
  })
}
