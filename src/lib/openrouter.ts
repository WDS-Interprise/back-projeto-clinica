export type OpenRouterMessage = {
  role: "system" | "user" | "assistant"
  content: string | null
  reasoning_details?: unknown
}

export type OpenRouterCompletion = {
  content: string | null
  reasoning_details?: unknown
  modelUsed?: string
}

function getNineRouterBase(): string {
  const raw = process.env.NINEROUTER_URL?.trim() || "http://localhost:20128"
  return `${raw.replace(/\/$/, "")}/v1`
}

function getApiKey(): string | null {
  const key = process.env.NINEROUTER_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  return key || null
}

export function getOpenRouterModel(): string {
  return process.env.NINEROUTER_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "combini"
}

export function getOpenRouterModelCandidates(): string[] {
  const primary = getOpenRouterModel()
  const nineFallbacks = process.env.NINEROUTER_MODEL_FALLBACKS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const openRouterFallbacks = process.env.OPENROUTER_MODEL_FALLBACKS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const fallbacks = nineFallbacks?.length
    ? nineFallbacks
    : openRouterFallbacks?.length
      ? openRouterFallbacks
      : [primary]
  return [...new Set([primary, ...fallbacks])]
}

export function isOpenRouterConfigured(): boolean {
  return !!getApiKey()
}

export function isRetryableOpenRouterError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return (
    /OPENROUTER_HTTP_(404|429|502|503|529)/.test(err.message) ||
    err.message.startsWith("OPENROUTER_EMPTY_RESPONSE")
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function chatCompletion(params: {
  messages: OpenRouterMessage[]
  reasoning?: boolean
  model?: string
}): Promise<OpenRouterCompletion> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error("OPENROUTER_NOT_CONFIGURED")

  const model = params.model ?? getOpenRouterModel()
  const url = `${getNineRouterBase()}/chat/completions`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: params.messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`OPENROUTER_HTTP_${res.status}: ${errText.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    model?: string
    choices?: Array<{
      message?: {
        content?: string | null
        reasoning?: string | null
        reasoning_details?: unknown
      }
    }>
  }
  const message = json.choices?.[0]?.message
  let content = message?.content ?? null
  if (!content?.trim() && message?.reasoning?.trim()) {
    content = message.reasoning
  }
  if (!content?.trim() && message?.reasoning_details) {
    content = extractTextFromReasoningDetails(message.reasoning_details)
  }
  if (!content?.trim()) {
    throw new Error(`OPENROUTER_EMPTY_RESPONSE: ${model}`)
  }
  return {
    content,
    reasoning_details: message?.reasoning_details,
    modelUsed: json.model ?? model,
  }
}

export async function chatCompletionWithFallback(params: {
  messages: OpenRouterMessage[]
  reasoning?: boolean
}): Promise<OpenRouterCompletion> {
  const models = getOpenRouterModelCandidates()
  let lastError: Error | null = null

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await chatCompletion({ ...params, model })
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const retryable = isRetryableOpenRouterError(lastError)
        console.warn(
          `[9Router] falha ${model} (tentativa ${attempt + 1}):`,
          lastError.message.slice(0, 120)
        )
        if (!retryable) break
        await sleep(600 * (attempt + 1))
      }
    }
  }

  throw lastError ?? new Error("OPENROUTER_ALL_MODELS_FAILED")
}

function extractTextFromReasoningDetails(details: unknown): string | null {
  if (!details) return null
  if (typeof details === "string") return details.trim() || null
  if (Array.isArray(details)) {
    const parts = details
      .map((d) => {
        if (typeof d === "string") return d
        if (d && typeof d === "object" && "text" in d) {
          return String((d as { text?: string }).text ?? "")
        }
        return ""
      })
      .filter(Boolean)
    return parts.join("\n").trim() || null
  }
  return null
}
