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
export const MAIL_SMTP_HOST = process.env.MAIL_SMTP_HOST || ""
export const MAIL_SMTP_PORT = Number(process.env.MAIL_SMTP_PORT || 587)
export const MAIL_SMTP_USER = process.env.MAIL_SMTP_USER || ""
export const MAIL_SMTP_PASS = process.env.MAIL_SMTP_PASS || ""
export const MAIL_FROM = process.env.MAIL_FROM || "ClinMax <noreply@clinmax.local>"

export function isMailConfigured() {
  return Boolean(MAIL_SMTP_HOST && MAIL_SMTP_USER && MAIL_SMTP_PASS)
}
