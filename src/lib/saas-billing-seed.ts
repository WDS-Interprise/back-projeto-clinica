import prisma from "@/lib/prisma.js"
import {
  allFeaturesEnabled,
  LEGACY_PLAN_SLUG,
  serializePlanFeatures,
  serializePlanLimits,
  unlimitedLimits,
  type PlanFeature,
  type PlanLimits,
} from "@/lib/plan-features.js"
import { computeTrialEnd } from "@/lib/plan-entitlements.js"

const STARTER_FEATURES: PlanFeature[] = [
  "DASHBOARD",
  "AGENDA",
  "PATIENTS",
  "MEDICAL_RECORDS",
  "PRESCRIPTIONS",
  "CLINICAL_TOOLS",
]

const PRO_FEATURES: PlanFeature[] = [
  ...STARTER_FEATURES,
  "WHATSAPP",
  "FINANCE",
  "REPORTS",
  "SATISFACTION",
  "MULTI_PROFESSIONAL",
]

const PREMIUM_FEATURES: PlanFeature[] = [
  ...PRO_FEATURES,
  "WHATSAPP_AI",
  "AUTOMATIONS",
  "CLINMAX_PAY",
  "INVENTORY",
  "TISS",
  "ADVANCED_REPORTS",
]

const STARTER_LIMITS: PlanLimits = {
  maxUsers: 3,
  maxDoctors: 1,
  maxWhatsappConnections: 0,
  maxAiMessagesPerMonth: 0,
  maxAiActionsPerMonth: 0,
  maxStorageMb: 1024,
}

const PRO_LIMITS: PlanLimits = {
  maxUsers: 8,
  maxDoctors: 3,
  maxWhatsappConnections: 1,
  maxAiMessagesPerMonth: 200,
  maxAiActionsPerMonth: 100,
  maxStorageMb: 5120,
}

const PREMIUM_LIMITS: PlanLimits = {
  maxUsers: null,
  maxDoctors: null,
  maxWhatsappConnections: 3,
  maxAiMessagesPerMonth: null,
  maxAiActionsPerMonth: null,
  maxStorageMb: null,
}

export async function ensurePlatformPlansAndSettings() {
  await prisma.platformSettings.upsert({
    where: { id: "platform" },
    create: {
      id: "platform",
      defaultTrialDays: 14,
      gracePeriodDays: 3,
      currency: "BRL",
      newSignupsEnabled: true,
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
      featuresJson: serializePlanFeatures(allFeaturesEnabled()),
      limitsJson: serializePlanLimits(unlimitedLimits()),
    },
  })

  await prisma.plan.upsert({
    where: { slug: "essencial" },
    create: {
      name: "Essencial",
      slug: "essencial",
      description: "Agenda, pacientes e prontuário para consultórios pequenos.",
      active: true,
      public: true,
      monthlyPrice: 99,
      annualPrice: 990,
      trialDays: 14,
      displayOrder: 1,
      featuresJson: serializePlanFeatures(STARTER_FEATURES),
      limitsJson: serializePlanLimits(STARTER_LIMITS),
    },
    update: {},
  })

  await prisma.plan.upsert({
    where: { slug: "profissional" },
    create: {
      name: "Profissional",
      slug: "profissional",
      description: "WhatsApp, financeiro e relatórios para clínicas em crescimento.",
      active: true,
      public: true,
      highlighted: true,
      monthlyPrice: 199,
      annualPrice: 1990,
      trialDays: 14,
      displayOrder: 2,
      featuresJson: serializePlanFeatures(PRO_FEATURES),
      limitsJson: serializePlanLimits(PRO_LIMITS),
    },
    update: {},
  })

  await prisma.plan.upsert({
    where: { slug: "premium" },
    create: {
      name: "Premium",
      slug: "premium",
      description: "IA, ClinMax Pay e módulos avançados sem limites rígidos.",
      active: true,
      public: true,
      monthlyPrice: 349,
      annualPrice: 3490,
      trialDays: 14,
      displayOrder: 3,
      featuresJson: serializePlanFeatures(PREMIUM_FEATURES),
      limitsJson: serializePlanLimits(PREMIUM_LIMITS),
    },
    update: {},
  })

  const prof = await prisma.plan.findUnique({ where: { slug: "profissional" } })
  await prisma.platformSettings.update({
    where: { id: "platform" },
    data: { defaultPlanId: prof?.id ?? legacy.id },
  })

  return { legacyPlanId: legacy.id, defaultPlanId: prof?.id ?? legacy.id }
}

export async function ensureClinicSubscription(clinicId: string, opts?: { planId?: string; trialDays?: number }) {
  const existing = await prisma.clinicSubscription.findUnique({ where: { clinicId } })
  if (existing) return existing

  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
  let planId = opts?.planId ?? settings?.defaultPlanId
  if (!planId) {
    const legacy = await prisma.plan.findUnique({ where: { slug: LEGACY_PLAN_SLUG } })
    planId = legacy?.id
  }
  if (!planId) throw new Error("NO_DEFAULT_PLAN")

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error("PLAN_NOT_FOUND")

  const isLegacy = plan.slug === LEGACY_PLAN_SLUG
  const trialDays = opts?.trialDays ?? (isLegacy ? 0 : plan.trialDays || settings?.defaultTrialDays || 14)
  const now = new Date()
  const trialEnds = trialDays > 0 ? computeTrialEnd(now, trialDays) : null

  return prisma.clinicSubscription.create({
    data: {
      clinicId,
      planId: plan.id,
      status: isLegacy ? "ACTIVE" : trialDays > 0 ? "TRIAL" : "ACTIVE",
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
}
