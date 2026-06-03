import { format, isValid, parse } from "date-fns"

/** Aceita 14042007, 14/04/2007, 2007-04-14, 14-04-2007 */
export function parseBirthDateInput(raw: string): {
  iso: string | null
  displayBr: string | null
  error?: string
} {
  const trimmed = raw.trim()
  if (!trimmed) return { iso: null, displayBr: null, error: "Data vazia" }

  const slashMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (slashMatch) {
    return fromParts(slashMatch[1], slashMatch[2], slashMatch[3])
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return fromParts(isoMatch[3], isoMatch[2], isoMatch[1])
  }

  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 8) {
    return fromParts(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8))
  }

  return {
    iso: null,
    displayBr: null,
    error: "Formato não reconhecido — use dd/mm/aaaa ou 8 dígitos (ddmmaaaa)",
  }
}

function fromParts(ddStr: string, mmStr: string, yyyyStr: string) {
  const dd = Number(ddStr)
  const mm = Number(mmStr)
  const yyyy = Number(yyyyStr)
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 2100) {
    return { iso: null, displayBr: null, error: "Data inválida" }
  }
  const parsed = parse(
    `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yyyy}`,
    "dd/MM/yyyy",
    new Date()
  )
  if (!isValid(parsed)) {
    return { iso: null, displayBr: null, error: "Data inválida" }
  }
  const iso = format(parsed, "yyyy-MM-dd")
  return { iso, displayBr: format(parsed, "dd/MM/yyyy") }
}

export function parseGenderInput(raw: string): "M" | "F" | "O" | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (/^(m|masc|masculino|homem|h)$/.test(s)) return "M"
  if (/^(f|fem|feminino|mulher)$/.test(s)) return "F"
  if (/^(o|outro|outros|nao.?bin|nb)$/.test(s)) return "O"
  return null
}

/** Formata telefone BR para exibição (62 99373-5178). */
export function formatPhoneBrDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length === 11) {
    return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return d
}

export function extractPhoneDigitsFromText(text: string): string | null {
  const match = text.replace(/\D/g, "")
  if (match.length >= 10 && match.length <= 13) {
    if (match.length === 11 || match.length === 10) return match
    if (match.length === 12 && match.startsWith("55")) return match.slice(2)
    if (match.length === 13 && match.startsWith("55")) return match.slice(2)
  }
  return null
}
