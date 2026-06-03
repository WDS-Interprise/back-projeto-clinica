import "dotenv/config"

const key = process.env.OPENROUTER_API_KEY
const models = [
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-4b:free",
  "openai/gpt-oss-20b:free",
  "openai/gpt-oss-120b:free",
  "z-ai/glm-4.5-air:free",
]

for (const model of models) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Responda só: ok" }],
      max_tokens: 20,
    }),
  })
  const json = await res.json().catch(() => ({}))
  const content = (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
    ?.message?.content
  console.log(res.status, model, content ?? JSON.stringify((json as { error?: unknown }).error).slice(0, 80))
}
