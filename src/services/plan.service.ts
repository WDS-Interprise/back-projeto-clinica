import prisma from "@/lib/prisma.js"
import {
  parsePlanFeatures,
  parsePlanLimits,
  serializePlanFeatures,
  serializePlanLimits,
  type PlanFeature,
  type PlanLimits,
} from "@/lib/plan-features.js"
import { moneyFromUnknown } from "@/lib/money.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import {
  annualEquivalentMonthly,
  COMPARISON_ROWS,
  formatComparisonValue,
  getCommercialPlan,
} from "@/lib/plan-catalog.js"

function presentPlan(row: {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  public: boolean
  monthlyPrice: unknown
  annualPrice: unknown
  trialDays: number
  highlighted: boolean
  displayOrder: number
  featuresJson: string
  limitsJson: string
  createdAt: Date
  updatedAt: Date
  _count?: { subscriptions: number }
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: row.active,
    public: row.public,
    monthlyPrice: moneyFromUnknown(row.monthlyPrice),
    annualPrice: moneyFromUnknown(row.annualPrice),
    trialDays: row.trialDays,
    highlighted: row.highlighted,
    displayOrder: row.displayOrder,
    features: parsePlanFeatures(row.featuresJson),
    limits: parsePlanLimits(row.limitsJson),
    clinicsUsing: row._count?.subscriptions ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listPlans(includeInactive = true) {
  const rows = await prisma.plan.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  })
  return rows.map(presentPlan)
}

export async function listPublicPlans() {
  const rows = await prisma.plan.findMany({
    where: { active: true, public: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })
  return rows.map((r) => presentPlan({ ...r, _count: { subscriptions: 0 } }))
}

export function presentPublicCatalogPlan(row: {
  name: string
  slug: string
  description: string | null
  monthlyPrice: unknown
  annualPrice: unknown
  trialDays: number
  highlighted: boolean
  displayOrder: number
  featuresJson: string
  limitsJson: string
}) {
  const marketing = getCommercialPlan(row.slug)
  const features = parsePlanFeatures(row.featuresJson)
  const limits = parsePlanLimits(row.limitsJson)
  const monthlyPrice = moneyFromUnknown(row.monthlyPrice)
  const annualPrice = moneyFromUnknown(row.annualPrice)
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    monthlyPrice,
    annualPrice,
    annualEquivalentMonthly: annualEquivalentMonthly(annualPrice),
    trialDays: row.trialDays,
    highlighted: row.highlighted,
    displayOrder: row.displayOrder,
    badge: marketing?.badge ?? (row.highlighted ? "Mais escolhido" : null),
    ctaLabel: marketing?.ctaLabel ?? "Assinar",
    marketingFeatures: marketing?.marketingFeatures ?? features.map((f) => f),
    limits,
    comparison: COMPARISON_ROWS.map((rowDef) => {
      const cell = formatComparisonValue({
        kind: rowDef.kind,
        feature: rowDef.feature,
        limitKey: rowDef.limitKey,
        features,
        limits,
      })
      return { key: rowDef.key, label: rowDef.label, ...cell }
    }),
  }
}

export async function listPublicCatalog() {
  const rows = await prisma.plan.findMany({
    where: { active: true, public: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })
  return {
    currency: "BRL",
    annualSavingsLabel: "Economize 2 meses",
    plans: rows.map(presentPublicCatalogPlan),
    comparisonRows: COMPARISON_ROWS.map((r) => ({ key: r.key, label: r.label })),
  }
}

export async function getPlanById(id: string) {
  const row = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  })
  return row ? presentPlan(row) : null
}

export async function createPlan(
  input: {
    name: string
    slug: string
    description?: string
    active?: boolean
    public?: boolean
    monthlyPrice?: number
    annualPrice?: number
    trialDays?: number
    highlighted?: boolean
    displayOrder?: number
    features?: PlanFeature[]
    limits?: PlanLimits
  },
  actorUserId?: string
) {
  const row = await prisma.plan.create({
    data: {
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      active: input.active ?? true,
      public: input.public ?? true,
      monthlyPrice: input.monthlyPrice ?? 0,
      annualPrice: input.annualPrice ?? 0,
      trialDays: input.trialDays ?? 0,
      highlighted: input.highlighted ?? false,
      displayOrder: input.displayOrder ?? 0,
      featuresJson: serializePlanFeatures(input.features ?? []),
      limitsJson: serializePlanLimits(input.limits ?? {}),
    },
    include: { _count: { select: { subscriptions: true } } },
  })
  await writeAuditLog({
    userId: actorUserId,
    module: "saas-billing",
    action: "plan-created",
    description: `Plano criado: ${row.name}`,
    entityType: "Plan",
    entityId: row.id,
  })
  return presentPlan(row)
}

export async function updatePlan(
  id: string,
  input: Partial<{
    name: string
    slug: string
    description: string | null
    active: boolean
    public: boolean
    monthlyPrice: number
    annualPrice: number
    trialDays: number
    highlighted: boolean
    displayOrder: number
    features: PlanFeature[]
    limits: PlanLimits
  }>,
  actorUserId?: string
) {
  const row = await prisma.plan.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      slug: input.slug?.trim().toLowerCase(),
      description: input.description,
      active: input.active,
      public: input.public,
      monthlyPrice: input.monthlyPrice,
      annualPrice: input.annualPrice,
      trialDays: input.trialDays,
      highlighted: input.highlighted,
      displayOrder: input.displayOrder,
      featuresJson: input.features ? serializePlanFeatures(input.features) : undefined,
      limitsJson: input.limits ? serializePlanLimits(input.limits) : undefined,
    },
    include: { _count: { select: { subscriptions: true } } },
  })
  await writeAuditLog({
    userId: actorUserId,
    module: "saas-billing",
    action: "plan-updated",
    description: `Plano alterado: ${row.name}`,
    entityType: "Plan",
    entityId: row.id,
  })
  return presentPlan(row)
}

export async function duplicatePlan(id: string, actorUserId?: string) {
  const source = await prisma.plan.findUnique({ where: { id } })
  if (!source) throw new Error("NOT_FOUND")
  const baseSlug = `${source.slug}-copia`
  let slug = baseSlug
  let i = 1
  while (await prisma.plan.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${i}`
    i += 1
  }
  return createPlan(
    {
      name: `${source.name} (cópia)`,
      slug,
      description: source.description ?? undefined,
      active: false,
      public: false,
      monthlyPrice: moneyFromUnknown(source.monthlyPrice),
      annualPrice: moneyFromUnknown(source.annualPrice),
      trialDays: source.trialDays,
      highlighted: false,
      displayOrder: source.displayOrder + 1,
      features: parsePlanFeatures(source.featuresJson),
      limits: parsePlanLimits(source.limitsJson),
    },
    actorUserId
  )
}

export async function setPlanActive(id: string, active: boolean, actorUserId?: string) {
  const subs = await prisma.clinicSubscription.count({
    where: { planId: id, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
  })
  if (!active && subs > 0) {
    throw new Error("PLAN_HAS_ACTIVE_SUBSCRIPTIONS")
  }
  return updatePlan(id, { active }, actorUserId)
}
