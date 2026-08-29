import prisma from "@/lib/prisma.js"
import {
  allFeaturesEnabled,
  LEGACY_PLAN_SLUG,
  serializePlanFeatures,
  serializePlanLimits,
  unlimitedLimits,
} from "@/lib/plan-features.js"
import { computeTrialEnd } from "@/lib/plan-entitlements.js"
import {
  COMMERCIAL_PLANS,
  PLAN_CATALOG_VERSION,
  isCommercialPlanSlug,
} from "@/lib/plan-catalog.js"

function parseSettingsJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Tabela/coluna ausente (prod parcial) — nao deve derrubar boot nem login. */
function isMissingSchemaError(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string }
  const msg = String(anyErr?.message ?? err)
  return (
    anyErr?.code === "P2021" ||
    anyErr?.code === "P2022" ||
    /does not exist/i.test(msg) ||
    /relation .+ does not exist/i.test(msg) ||
    /column .+ does not exist/i.test(msg)
  )
}

export async function ensurePlatformPlansAndSettings() {
  try {
    await prisma.platformSettings.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        defaultTrialDays: 0,
        gracePeriodDays: 3,
        currency: "BRL",
        newSignupsEnabled: true,
        settingsJson: JSON.stringify({ catalogVersion: 0 }),
      },
      update: {},
    })

    const legacy = await prisma.plan.upsert({
      where: { slug: LEGACY_PLAN_SLUG },
      create: {
        name: "Legacy",
        slug: LEGACY_PLAN_SLUG,
        description: "Plano interno para clínicas existentes antes do billing SaaS.",
        active: true,
        public: false,
        monthlyPrice: 0,
        annualPrice: 0,
        trialDays: 0,
        displayOrder: 999,
        featuresJson: serializePlanFeatures(allFeaturesEnabled()),
        limitsJson: serializePlanLimits(unlimitedLimits()),
      },
      update: {
        public: false,
        monthlyPrice: 0,
        annualPrice: 0,
        featuresJson: serializePlanFeatures(allFeaturesEnabled()),
        limitsJson: serializePlanLimits(unlimitedLimits()),
      },
    })

    const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
    const extra = parseSettingsJson(settings?.settingsJson)
    const currentVersion = Number(extra.catalogVersion ?? 0)
    const shouldSyncCatalog = currentVersion < PLAN_CATALOG_VERSION

    for (const def of COMMERCIAL_PLANS) {
      const payload = {
        name: def.name,
        description: def.description,
        active: true,
        public: true,
        monthlyPrice: def.monthlyPrice,
        annualPrice: def.annualPrice,
        trialDays: def.trialDays,
        highlighted: def.highlighted,
        displayOrder: def.displayOrder,
        featuresJson: serializePlanFeatures(def.features),
        limitsJson: serializePlanLimits(def.limits),
      }
      await prisma.plan.upsert({
        where: { slug: def.slug },
        create: {
          slug: def.slug,
          ...payload,
        },
        update: shouldSyncCatalog ? payload : {},
      })
    }

    if (shouldSyncCatalog) {
      await prisma.platformSettings.update({
        where: { id: "platform" },
        data: {
          defaultTrialDays: 0,
          settingsJson: JSON.stringify({ ...extra, catalogVersion: PLAN_CATALOG_VERSION }),
        },
      })
    }

    const prof = await prisma.plan.findUnique({ where: { slug: "profissional" } })
    await prisma.platformSettings.update({
      where: { id: "platform" },
      data: { defaultPlanId: prof?.id ?? legacy.id },
    })

    return { legacyPlanId: legacy.id, defaultPlanId: prof?.id ?? legacy.id }
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn(
        "[SaaS Billing] schema incompleto (Plan/PlatformSettings ausente). Rode migrate ou prisma db push. Seed pulado."
      )
      return null
    }
    throw err
  }
}

export async function ensureClinicSubscription(
  clinicId: string,
  opts?: { planId?: string; planSlug?: string; trialDays?: number }
) {
  const existing = await prisma.clinicSubscription.findUnique({ where: { clinicId } })
  if (existing) return existing

  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
  let planId = opts?.planId
  if (!planId && opts?.planSlug && isCommercialPlanSlug(opts.planSlug)) {
    const chosen = await prisma.plan.findUnique({ where: { slug: opts.planSlug } })
    planId = chosen?.id
  }
  if (!planId) planId = settings?.defaultPlanId ?? undefined
  if (!planId) {
    const legacy = await prisma.plan.findUnique({ where: { slug: LEGACY_PLAN_SLUG } })
    planId = legacy?.id
  }
  if (!planId) throw new Error("NO_DEFAULT_PLAN")

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error("PLAN_NOT_FOUND")

  const isLegacy = plan.slug === LEGACY_PLAN_SLUG
  const trialDays = opts?.trialDays ?? (isLegacy ? 0 : plan.trialDays)
  const now = new Date()
  const trialEnds = trialDays > 0 ? computeTrialEnd(now, trialDays) : null
  const status = isLegacy ? "ACTIVE" : trialDays > 0 ? "TRIAL" : "ACTIVE"

  return prisma.clinicSubscription.create({
    data: {
      clinicId,
      planId: plan.id,
      status,
      billingCycle: "MONTHLY",
      startedAt: now,
      trialStartedAt: trialDays > 0 ? now : null,
      trialEndsAt: trialEnds,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnds,
    },
    include: { plan: true },
  })
}

/** Associa plano legacy a todas as clínicas sem assinatura. */
export async function migrateExistingClinicsToLegacy() {
  try {
    const legacy = await prisma.plan.findUnique({ where: { slug: LEGACY_PLAN_SLUG } })
    if (!legacy) return { migrated: 0 }

    const clinics = await prisma.clinic.findMany({
      where: { subscription: null },
      select: { id: true },
    })

    let migrated = 0
    for (const clinic of clinics) {
      await ensureClinicSubscription(clinic.id, { planId: legacy.id, trialDays: 0 })
      migrated += 1
    }
    return { migrated }
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn("[SaaS Billing] migrateExistingClinicsToLegacy pulado (schema incompleto).")
      return { migrated: 0 }
    }
    throw err
  }
}
