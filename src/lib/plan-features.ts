/** Catálogo central de recursos disponíveis nos planos SaaS. */
export const PLAN_FEATURES = [
  "DASHBOARD",
  "AGENDA",
  "PATIENTS",
  "MEDICAL_RECORDS",
  "PRESCRIPTIONS",
  "CLINICAL_TOOLS",
  "WHATSAPP",
  "WHATSAPP_AI",
  "AUTOMATIONS",
  "FINANCE",
  "CLINMAX_PAY",
  "REPORTS",
  "INVENTORY",
  "TISS",
  "SATISFACTION",
  "MULTI_PROFESSIONAL",
  "ADVANCED_REPORTS",
  "AI_ASSISTANT",
] as const

export type PlanFeature = (typeof PLAN_FEATURES)[number]

export const PLAN_LIMIT_KEYS = [
  "maxUsers",
  "maxDoctors",
  "maxWhatsappConnections",
  "maxAiAssistantMessagesPerMonth",
  "maxAiAutomationActionsPerMonth",
  "maxStorageMb",
] as const

export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number]

/** Compatibilidade com JSON antigo gravado no banco. */
const LEGACY_LIMIT_ALIASES: Record<string, PlanLimitKey> = {
  maxAiMessagesPerMonth: "maxAiAssistantMessagesPerMonth",
  maxAiActionsPerMonth: "maxAiAutomationActionsPerMonth",
}

export type PlanLimits = Partial<Record<PlanLimitKey, number | null>>

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  DASHBOARD: "Painel",
  AGENDA: "Agenda",
  PATIENTS: "Pacientes",
  MEDICAL_RECORDS: "Prontuário",
  PRESCRIPTIONS: "Prescrições",
  CLINICAL_TOOLS: "Medicamentos, bulas e CID",
  WHATSAPP: "WhatsApp",
  WHATSAPP_AI: "WhatsApp com IA",
  AUTOMATIONS: "Automações",
  FINANCE: "Financeiro",
  CLINMAX_PAY: "ClinMax Pay",
  REPORTS: "Relatórios",
  INVENTORY: "Estoque",
  TISS: "TISS",
  SATISFACTION: "Pesquisa de satisfação",
  MULTI_PROFESSIONAL: "Multi-profissional",
  ADVANCED_REPORTS: "Relatórios avançados",
  AI_ASSISTANT: "IA assistiva",
}

export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  maxUsers: "Usuários",
  maxDoctors: "Profissionais",
  maxWhatsappConnections: "WhatsApps conectados",
  maxAiAssistantMessagesPerMonth: "IA assistiva / mês",
  maxAiAutomationActionsPerMonth: "Ações automáticas IA / mês",
  maxStorageMb: "Armazenamento (MB)",
}

/** Mapeamento recurso do plano → permissões CRM relacionadas (para UI). */
export const FEATURE_PERMISSION_HINTS: Partial<Record<PlanFeature, string[]>> = {
  DASHBOARD: ["dashboard:view"],
  AGENDA: ["agenda:view"],
  PATIENTS: ["patients:view"],
  MEDICAL_RECORDS: ["records:view"],
  PRESCRIPTIONS: ["prescriptions:write"],
  CLINICAL_TOOLS: ["clinical_tools:view"],
  WHATSAPP: ["whatsapp:send"],
  FINANCE: ["finance:view", "finance:manage"],
  REPORTS: ["reports:view"],
}

export function isPlanFeature(value: string): value is PlanFeature {
  return (PLAN_FEATURES as readonly string[]).includes(value)
}

export function isPlanLimitKey(value: string): value is PlanLimitKey {
  return (PLAN_LIMIT_KEYS as readonly string[]).includes(value)
}

export function parsePlanFeatures(json: string | null | undefined): PlanFeature[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((f): f is PlanFeature => typeof f === "string" && isPlanFeature(f))
  } catch {
    return []
  }
}

export function parsePlanLimits(json: string | null | undefined): PlanLimits {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const limits: PlanLimits = {}
    for (const [legacy, key] of Object.entries(LEGACY_LIMIT_ALIASES)) {
      if (parsed[key] === undefined && parsed[legacy] !== undefined) {
        parsed[key] = parsed[legacy]
      }
    }
    for (const key of PLAN_LIMIT_KEYS) {
      const raw = parsed[key]
      if (raw === null) limits[key] = null
      else if (typeof raw === "number" && Number.isFinite(raw)) limits[key] = raw
    }
    return limits
  } catch {
    return {}
  }
}

export function serializePlanFeatures(features: PlanFeature[]): string {
  return JSON.stringify([...new Set(features)])
}

export function serializePlanLimits(limits: PlanLimits): string {
  const out: Record<string, number | null> = {}
  for (const key of PLAN_LIMIT_KEYS) {
    if (limits[key] !== undefined) out[key] = limits[key] ?? null
  }
  if (out.maxAiAssistantMessagesPerMonth !== undefined) {
    out.maxAiMessagesPerMonth = out.maxAiAssistantMessagesPerMonth
  }
  if (out.maxAiAutomationActionsPerMonth !== undefined) {
    out.maxAiActionsPerMonth = out.maxAiAutomationActionsPerMonth
  }
  return JSON.stringify(out)
}

/** Plano legacy: todos os recursos, limites ilimitados. */
export const LEGACY_PLAN_SLUG = "legacy"

export function allFeaturesEnabled(): PlanFeature[] {
  return [...PLAN_FEATURES]
}

export function unlimitedLimits(): PlanLimits {
  const limits: PlanLimits = {}
  for (const key of PLAN_LIMIT_KEYS) limits[key] = null
  return limits
}

/** Entitlement efetivo: base do plano + add-ons + cortesias/overrides. */
export function mergeEntitlementLimits(base: PlanLimits, addons: PlanLimits = {}, overrides: PlanLimits = {}): PlanLimits {
  const out: PlanLimits = { ...base }
  for (const key of PLAN_LIMIT_KEYS) {
    const extra = addons[key]
    if (typeof extra === "number" && extra > 0 && typeof out[key] === "number") {
      out[key] = (out[key] as number) + extra
    } else if (extra === null) {
      out[key] = null
    }
    if (overrides[key] !== undefined) out[key] = overrides[key]
  }
  return out
}
