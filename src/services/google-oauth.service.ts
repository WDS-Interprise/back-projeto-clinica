import jwt from "jsonwebtoken"
import {
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  JWT_SECRET,
} from "@/lib/env.js"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

type GoogleTokenResponse = {
  access_token: string
}

type GoogleUserInfo = {
  id: string
  email: string
  verified_email?: boolean
  name: string
  picture?: string
}

export function createGoogleOAuthState() {
  return jwt.sign({ purpose: "google_oauth" }, JWT_SECRET, { expiresIn: "10m" })
}

export function verifyGoogleOAuthState(state: string) {
  try {
    const payload = jwt.verify(state, JWT_SECRET) as { purpose?: string }
    return payload.purpose === "google_oauth"
  } catch {
    return false
  }
}

export function getGoogleAuthRedirectUrl(state: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUserInfo> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  })

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text()
    throw Object.assign(new Error("GOOGLE_TOKEN_EXCHANGE_FAILED"), { detail })
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse

  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) {
    throw Object.assign(new Error("GOOGLE_USERINFO_FAILED"), {})
  }

  return (await userRes.json()) as GoogleUserInfo
}

export function buildGoogleCallbackFrontendUrl(params: Record<string, string>) {
  const q = new URLSearchParams(params)
  return `${FRONTEND_URL.replace(/\/$/, "")}/auth/google/callback?${q.toString()}`
}
