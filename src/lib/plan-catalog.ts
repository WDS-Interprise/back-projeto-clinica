import {
  type PlanFeature,
  type PlanLimits,
  PLAN_FEATURE_LABELS,
} from "@/lib/plan-features.js"

/** Subir este número força o seed a reaplicar o pacote comercial nos slugs públicos. */
export const PLAN_CATALOG_VERSION = 5

export const COMMERCIAL_PLAN_SLUGS = ["gratis", "essencial", "profissional", "premium"] as const
export type CommercialPlanSlug = (typeof COMMERCIAL_PLAN_SLUGS)[number]
export const DEFAULT_SIGNUP_PLAN_SLUG: CommercialPlanSlug = "gratis"
export const WEBHOOK_TEST_PLAN_SLUG = "teste-webhook"

export type ComparisonKind = "feature" | "limit"

export type ComparisonRowDef = {
  key: string
  label: string
  kind: ComparisonKind
  feature?: PlanFeature
  limitKey?: keyof PlanLimits
}

export type CommercialPlanDef = {
  slug: CommercialPlanSlug
  name: string
  description: string
  monthlyPrice: number
  annualPrice: number
  trialDays: number
  highlighted: boolean
  displayOrder: number
  public: true
  badge: string | null
  ctaLabel: string
  marketingFeatures: string[]
  features: PlanFeature[]
  limits: PlanLimits
}

const FREE_FEATURES: PlanFeature[] = ["DASHBOARD", "AGENDA", "PATIENTS"]

const ESSENTIAL_FEATURES: PlanFeature[] = [
  "DASHBOARD",
  "AGENDA",
  "PATIENTS",
  "MEDICAL_RECORDS",
  "PRESCRIPTIONS",
  "CLINICAL_TOOLS",
]

const PROFESSIONAL_FEATURES: PlanFeature[] = [
  ...ESSENTIAL_FEATURES,
  "WHATSAPP",
  "FINANCE",
  "CLINMAX_PAY",
  "REPORTS",
  "SATISFACTION",
  "MULTI_PROFESSIONAL",
  "AI_ASSISTANT",
]

const PREMIUM_FEATURES: PlanFeature[] = [
  ...PROFESSIONAL_FEATURES,
  "WHATSAPP_AI",
  "AUTOMATIONS",
  "INVENTORY",
  "TISS",
  "ADVANCED_REPORTS",
]

export const COMMERCIAL_PLANS: CommercialPlanDef[] = [
  {
    slug: "gratis",
    name: "Grátis",
    description: "Comece sem pagar. Agenda, pacientes e painel, com limites reduzidos.",
    monthlyPrice: 0,
    annualPrice: 0,
    trialDays: 0,
    highlighted: false,
    displayOrder: 0,
    public: true,
    badge: "Padrão",
    ctaLabel: "Começar grátis",
    marketingFeatures: [
      "Painel",
      "Agenda",
      "Pacientes",
      "1 usuário",
      "1 profissional",
      "Sem WhatsApp, financeiro e IA",
    ],
    features: FREE_FEATURES,
    limits: {
      maxUsers: 1,
      maxDoctors: 1,
      maxWhatsappConnections: 0,
      maxAiAssistantMessagesPerMonth: 0,
      maxAiAutomationActionsPerMonth: 0,
      maxStorageMb: 512,
    },
  },
  {
    slug: "essencial",
    name: "Essencial",
    description: "Operação clínica básica para profissional individual ou consultório pequeno.",
    monthlyPrice: 99,
    annualPrice: 990,
    trialDays: 0,
    highlighted: false,
    displayOrder: 1,
    public: true,
    badge: null,
    ctaLabel: "Assinar Essencial",
    marketingFeatures: [
      "Agenda online",
      "Prontuário eletrônico",
      "Pacientes",
      "Prescrições",
      "Bulas e CID",
      "1 profissional",
    ],
    features: ESSENTIAL_FEATURES,
    limits: {
      maxUsers: 3,
      maxDoctors: 1,
      maxWhatsappConnections: 0,
      maxAiAssistantMessagesPerMonth: 0,
      maxAiAutomationActionsPerMonth: 0,
      maxStorageMb: 2048,
    },
  },
  {
    slug: "profissional",
    name: "Profissional",
    description: "Gestão completa para clínicas pequenas e médias em crescimento.",
    monthlyPrice: 199,
    annualPrice: 1990,
    trialDays: 0,
    highlighted: true,
    displayOrder: 2,
    public: true,
    badge: "Mais escolhido",
    ctaLabel: "Assinar Profissional",
    marketingFeatures: [
      "Tudo do Essencial",
      "Financeiro",
      "WhatsApp integrado",
      "Relatórios",
      "Pesquisa de satisfação",
      "Até 3 profissionais",
      "Assistente com IA",
    ],
    features: PROFESSIONAL_FEATURES,
    limits: {
      maxUsers: 10,
      maxDoctors: 3,
      maxWhatsappConnections: 1,
      maxAiAssistantMessagesPerMonth: 300,
      maxAiAutomationActionsPerMonth: 0,
      maxStorageMb: 10240,
    },
  },
  {
    slug: "premium",
    name: "Premium",
    description: "Automação, inteligência artificial e escala.",
    monthlyPrice: 349,
    annualPrice: 3490,
    trialDays: 0,
    highlighted: false,
    displayOrder: 3,
    public: true,
    badge: null,
    ctaLabel: "Assinar Premium",
    marketingFeatures: [
      "Tudo do Profissional",
      "WhatsApp com IA",
      "Automações avançadas",
      "Indicadores avançados",
      "Até 3 WhatsApps",
      "Maior capacidade de IA",
      "Suporte prioritário",
    ],
    features: PREMIUM_FEATURES,
    limits: {
      maxUsers: 30,
      maxDoctors: 5,
      maxWhatsappConnections: 3,
      maxAiAssistantMessagesPerMonth: 5000,
      maxAiAutomationActionsPerMonth: 2000,
      maxStorageMb: 51200,
    },
  },
]

export const WEBHOOK_TEST_PLAN = {
  slug: WEBHOOK_TEST_PLAN_SLUG,
  name: "Teste 1 centavo",
  description: "Plano de teste do Pix. Custa R$ 0,01.",
  monthlyPrice: 0.01,
  annualPrice: 0.01,
  trialDays: 0,
  highlighted: false,
  displayOrder: 4,
  public: false,
  features: FREE_FEATURES,
  limits: {
    maxUsers: 1,
    maxDoctors: 1,
    maxWhatsappConnections: 0,
    maxAiAssistantMessagesPerMonth: 0,
    maxAiAutomationActionsPerMonth: 0,
    maxStorageMb: 512,
  },
} as const

export const COMPARISON_ROWS: ComparisonRowDef[] = [
  { key: "agenda", label: "Agenda", kind: "feature", feature: "AGENDA" },
  { key: "records", label: "Prontuário", kind: "feature", feature: "MEDICAL_RECORDS" },
  { key: "prescriptions", label: "Prescrições", kind: "feature", feature: "PRESCRIPTIONS" },
  { key: "finance", label: "Financeiro", kind: "feature", feature: "FINANCE" },
  { key: "whatsapp", label: "WhatsApp", kind: "feature", feature: "WHATSAPP" },
  { key: "pay", label: "ClinMax Pay", kind: "feature", feature: "CLINMAX_PAY" },
  { key: "ai-assist", label: "IA assistiva", kind: "feature", feature: "AI_ASSISTANT" },
  { key: "ai-ops", label: "IA operacional", kind: "feature", feature: "WHATSAPP_AI" },
  { key: "whatsapp-ai", label: "WhatsApp com IA", kind: "feature", feature: "WHATSAPP_AI" },
  { key: "automations", label: "Automações avançadas", kind: "feature", feature: "AUTOMATIONS" },
  { key: "reports", label: "Relatórios", kind: "feature", feature: "REPORTS" },
  { key: "satisfaction", label: "Pesquisa de satisfação", kind: "feature", feature: "SATISFACTION" },
  { key: "inventory", label: "Estoque", kind: "feature", feature: "INVENTORY" },
  { key: "tiss", label: "TISS", kind: "feature", feature: "TISS" },
  { key: "doctors", label: "Profissionais", kind: "limit", limitKey: "maxDoctors" },
  { key: "users", label: "Usuários", kind: "limit", limitKey: "maxUsers" },
  { key: "wa-limit", label: "WhatsApps conectados", kind: "limit", limitKey: "maxWhatsappConnections" },
  { key: "ai-assist-limit", label: "IA assistiva / mês", kind: "limit", limitKey: "maxAiAssistantMessagesPerMonth" },
  { key: "ai-ops-limit", label: "Ações automáticas IA / mês", kind: "limit", limitKey: "maxAiAutomationActionsPerMonth" },
  { key: "storage", label: "Armazenamento", kind: "limit", limitKey: "maxStorageMb" },
]

export function getCommercialPlan(slug: string) {
  return COMMERCIAL_PLANS.find((p) => p.slug === slug) ?? null
}

export function isCommercialPlanSlug(slug: string): slug is CommercialPlanSlug {
  return (COMMERCIAL_PLAN_SLUGS as readonly string[]).includes(slug)
}

export function commercialPlanRank(slug: string): number {
  return (COMMERCIAL_PLAN_SLUGS as readonly string[]).indexOf(slug)
}

export function nextCommercialPlanSlug(fromSlug: string): CommercialPlanSlug | null {
  if (!isCommercialPlanSlug(fromSlug)) return DEFAULT_SIGNUP_PLAN_SLUG
  return COMMERCIAL_PLAN_SLUGS[commercialPlanRank(fromSlug) + 1] ?? null
}

export function isNextCommercialUpgrade(fromSlug: string, toSlug: string): boolean {
  return nextCommercialPlanSlug(fromSlug) === toSlug
}

export function isCommercialRankUpgrade(fromSlug: string, toSlug: string): boolean {
  if (!isCommercialPlanSlug(toSlug)) return false
  if (!isCommercialPlanSlug(fromSlug)) return true
  return commercialPlanRank(toSlug) > commercialPlanRank(fromSlug)
}

export function annualEquivalentMonthly(annualPrice: number) {
  return Math.round((annualPrice / 12) * 100) / 100
}

export function formatComparisonValue(opts: {
  kind: ComparisonKind
  feature?: PlanFeature
  limitKey?: keyof PlanLimits
  features: PlanFeature[]
  limits: PlanLimits
}): { included: boolean; value: string } {
  if (opts.kind === "feature" && opts.feature) {
    const included = opts.features.includes(opts.feature)
    return { included, value: included ? "Sim" : "Não" }
  }
  if (opts.limitKey) {
    const max = opts.limits[opts.limitKey]
    if (opts.limitKey === "maxStorageMb" && typeof max === "number") {
      const gb = max / 1024
      return { included: max > 0, value: Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB` }
    }
    if (max === 0) return { included: false, value: "Não" }
    if (max == null) return { included: true, value: "Sob consulta" }
    return { included: true, value: String(max) }
  }
  return { included: false, value: "Não" }
}

export function featureLabel(feature: PlanFeature) {
  return PLAN_FEATURE_LABELS[feature]
}
