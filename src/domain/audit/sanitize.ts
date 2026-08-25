const ALLOWED_METADATA_KEYS = new Set([
  "appointmentId",
  "prescriptionId",
  "encounterId",
  "shareId",
  "fromStatus",
  "toStatus",
  "cidCode",
  "cidVersion",
  "signatureMode",
  "signatureStatus",
  "provider",
  "failureCode",
  "version",
  "idempotent",
  "reasonCode",
  "itemCount",
  "hasAddendumReason",
])

const FORBIDDEN_KEY_PATTERN =
  /(name|cpf|cnpj|phone|email|queixa|diagn|complaint|conduct|prescription|notes|body|password|token|secret|pin)/i

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!metadata) return null
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEY_PATTERN.test(key) && !ALLOWED_METADATA_KEYS.has(key)) continue
    if (!ALLOWED_METADATA_KEYS.has(key)) continue
    if (value === undefined) continue
    if (typeof value === "string" && value.length > 80) continue
    out[key] = value
  }
  return Object.keys(out).length ? out : null
}
