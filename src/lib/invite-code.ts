import { randomBytes } from "crypto"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length)
  let code = ""
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return code
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex")
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}
