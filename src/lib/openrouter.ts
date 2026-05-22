export type OpenRouterMessage = {
  role: "system" | "user" | "assistant"
  content: string | null
  reasoning_details?: unknown
}

export type OpenRouterCompletion = {
  content: string | null
  reasoning_details?: unknown
}

function getApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  return key || null
}

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-oss-120b:free"
}

export function isOpenRouterConfigured(): boolean {
  return !!getApiKey()
}

export async function chatCompletion(params: {
  messages: OpenRouterMessage[]
  reasoning?: boolean
}): Promise<OpenRouterCompletion> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error("OPENROUTER_NOT_CONFIGURED")

  const body: Record<string, unknown> = {
    model: getOpenRouterModel(),
    messages: params.messages,
  }
  if (params.reasoning) {
    body.reasoning = { enabled: true }
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL ?? "http://localhost:3001",
      "X-Title": "ClinMax WhatsApp Assistant",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`OPENROUTER_HTTP_${res.status}: ${errText.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
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
  return {
    content,
    reasoning_details: message?.reasoning_details,
  }
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
