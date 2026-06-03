import { FRONTEND_URL, PUBLIC_APP_URL } from "@/lib/env.js"

const DEFAULT_PRODUCTION_ORIGINS = [
  "https://www.clinmax.com.br",
  "https://clinmax.com.br",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

function parseCsvOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function resolveCorsOrigins(): boolean | string[] {
  if (process.env.NODE_ENV !== "production") {
    return true
  }

  const fromEnv = process.env.CORS_ORIGINS?.trim()
  const origins = new Set<string>([
    ...DEFAULT_PRODUCTION_ORIGINS,
    PUBLIC_APP_URL,
    FRONTEND_URL,
    ...(fromEnv ? parseCsvOrigins(fromEnv) : []),
  ])

  return [...origins].filter(Boolean)
}
