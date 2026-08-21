import { config } from "dotenv"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, "../../.env") })

export const JWT_SECRET = process.env.JWT_SECRET || "clinicare-dev-secret"
export const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d"
export const PORT = Number(process.env.PORT) || 3001
export const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || process.env.API_PUBLIC_URL || `http://localhost:${PORT}`
export const FRONTEND_URL =
  process.env.FRONTEND_URL || process.env.VITE_APP_URL || "http://localhost:5173"
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth/google/callback`

export function isGoogleOAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
}
export const MAIL_SMTP_HOST =
  process.env.MAIL_SMTP_HOST?.trim() || process.env.MAIL_HOST?.trim() || ""
export const MAIL_SMTP_PORT = Number(
  process.env.MAIL_SMTP_PORT || process.env.MAIL_PORT || 587
)
export const MAIL_SMTP_USER =
  process.env.MAIL_SMTP_USER?.trim() || process.env.MAIL_USER?.trim() || ""
export const MAIL_SMTP_PASS =
  process.env.MAIL_SMTP_PASS || process.env.MAIL_PASS || ""
export const MAIL_SENDER =
  process.env.MAIL_SENDER?.trim() ||
  process.env.MAIL_SMTP_USER?.trim() ||
  process.env.MAIL_USER?.trim() ||
  ""
export const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "ClinMax"

export function isMailConfigured() {
  return Boolean(MAIL_SMTP_HOST && MAIL_SMTP_USER && MAIL_SMTP_PASS)
}

function resolveAsaasApiKey() {
  const encoded = process.env.ASAAS_API_KEY_BASE64?.trim()
  if (encoded) {
    try {
      return Buffer.from(encoded, "base64").toString("utf8").trim()
    } catch {
      return ""
    }
  }
  return (process.env.ASAAS_API_KEY || "").trim()
}

export const ASAAS_API_KEY = resolveAsaasApiKey()
export const ASAAS_BASE_URL = (process.env.ASAAS_BASE_URL || "https://api.asaas.com").replace(/\/$/, "")
export const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || ""
export const ASAAS_WEBHOOK_EMAIL = process.env.ASAAS_WEBHOOK_EMAIL || ""
export const ASAAS_PIX_KEY = process.env.ASAAS_PIX_KEY || ""
export const ASAAS_CUSTOMER_ID = process.env.ASAAS_CUSTOMER_ID || ""
export const CLINMAX_PAY_FEE_PERCENT = Number(process.env.CLINMAX_PAY_FEE_PERCENT || 5)

export function isAsaasConfigured() {
  return Boolean(ASAAS_API_KEY)
}
