import type { PixKeyType } from "@prisma/client"

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

export function detectPixKeyType(raw: string): PixKeyType | null {
  const key = raw.trim()
  if (!key) return null
  if (key.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "EMAIL"
  const digits = onlyDigits(key)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "EVP"
  if (digits.length === 11 && /^\d{11}$/.test(digits) && (key.startsWith("+") || key.length <= 16) && !isCpfChecksum(digits)) {
    // phone vs cpf: if formatted as phone (+55 / DDD) prefer PHONE when starts with 55 and not a valid-looking document-only field
  }
  if (digits.length === 14) return "CNPJ"
  if (digits.length === 11) {
    if (key.startsWith("+") || key.startsWith("55") && key.replace(/\D/g, "").length >= 12) return "PHONE"
    return "CPF"
  }
  if (digits.length === 10 || digits.length === 12 || digits.length === 13) return "PHONE"
  return null
}

function isCpfChecksum(digits: string) {
  return digits.length === 11
}

export function normalizePixKey(raw: string, type: PixKeyType): string {
  const key = raw.trim()
  if (type === "EMAIL") return key.toLowerCase()
  if (type === "EVP") return key.toLowerCase()
  if (type === "PHONE") {
    let digits = onlyDigits(key)
    if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2)
    return digits
  }
  return onlyDigits(key)
}

export function maskPixKey(key: string, type: PixKeyType) {
  if (type === "EMAIL") {
    const [user, domain] = key.split("@")
    if (!domain) return "••••"
    return `${user.slice(0, 1)}••••@${domain}`
  }
  if (type === "EVP") return `${key.slice(0, 4)}••••${key.slice(-4)}`
  const digits = onlyDigits(key)
  return `${"•".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`
}

export function validateRecipientDocument(document: string, type: PixKeyType, pixKey: string) {
  const doc = onlyDigits(document)
  if (doc.length !== 11 && doc.length !== 14) return false
  if (type === "CPF" && onlyDigits(pixKey) !== doc) return false
  if (type === "CNPJ" && onlyDigits(pixKey) !== doc) return false
  return true
}
