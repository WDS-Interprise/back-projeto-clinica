export const REGULATORY_LABELS: Record<string, string> = {
  REFERENCE: "Referência",
  GENERIC: "Genérico",
  SIMILAR: "Similar",
  NEW: "Novo",
  SPECIFIC: "Específico",
  BIOLOGICAL: "Biológico",
  RADIOPHARMACEUTICAL: "Radiofarmacêutico",
}

export function formatRegulatoryCategory(code?: string | null) {
  if (!code) return undefined
  return REGULATORY_LABELS[code] ?? code
}
