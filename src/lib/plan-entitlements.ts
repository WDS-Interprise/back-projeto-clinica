import prisma from "@/lib/prisma.js"
import {
  type PlanFeature,
  type PlanLimitKey,
  type PlanLimits,
  parsePlanFeatures,
  parsePlanLimits,
  LEGACY_PLAN_SLUG,
} from "@/lib/plan-features.js"
import { addDays, startOfMonth, endOfMonth, isAfter } from "date-fns"

export class PlanFeatureRequiredError extends Error {
  feature: PlanFeature
  constructor(feature: PlanFeature) {
    super("PLAN_FEATURE_REQUIRED")
    this.feature = feature
  }
}

export class PlanLimitReachedError extends Error {
  limit: PlanLimitKey
  current: number
  max: number
  constructor(limit: PlanLimitKey, current: number, max: number) {
    super("PLAN_LIMIT_REACHED")
    this.limit = limit
    this.current = current
    this.max = max
  }
}

export type ClinicEntitlements = {
  clinicId: string
  planId: string | null
  planName: string | null
  planSlug: string | null
  subscriptionStatus: string | null
  features: PlanFeature[]
  limits: PlanLimits
  isActive: boolean
}

function periodKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

async function loadSubscription(clinicId: string) {
  return prisma.clinicSubscription.findUnique({
    where: { clinicId },
    include: { plan: true },
  })
}

async function subscriptionGrantsAccess(
  sub: NonNullable<Awaited<ReturnType<typeof loadSubscription>>>
): Promise<boolean> {
  const now = new Date()

  if (sub.courtesyUntil && isAfter(sub.courtesyUntil, now)) {
    return true
  }

  if (sub.status === "ACTIVE") return true

  if (sub.status === "TRIAL") {
    if (!sub.trialEndsAt) return true
    return isAfter(sub.trialEndsAt, now)
  }

  if (sub.status === "PAST_DUE") {
    const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
    const graceDays = settings?.gracePeriodDays ?? 3
    const overdueInvoice = await prisma.subscriptionInvoice.findFirst({
      where: {
        clinicSubscriptionId: sub.id,
        status: { in: ["OVERDUE", "PENDING"] },
      },
      orderBy: { dueDate: "asc" },
    })
    if (!overdueInvoice) return true
    return !isAfter(now, addDays(overdueInvoice.dueDate, graceDays))
  }

  return false
}

export async function getClinicEntitlements(clinicId: string): Promise<ClinicEntitlements> {
  const sub = await loadSubscription(clinicId)
  if (!sub?.plan) {
    return {
      clinicId,
      planId: null,
      planName: null,
      planSlug: null,
      subscriptionStatus: null,
      features: [],
      limits: {},
      isActive: false,
    }
  }

  const active = await subscriptionGrantsAccess(sub)
  return {
    clinicId,
    planId: sub.planId,
    planName: sub.plan.name,
    planSlug: sub.plan.slug,
    subscriptionStatus: sub.status,
    features: active ? parsePlanFeatures(sub.plan.featuresJson) : [],
    limits: active ? parsePlanLimits(sub.plan.limitsJson) : {},
    isActive: active,
  }
}

export async function clinicHasFeature(clinicId: string, feature: PlanFeature): Promise<boolean> {
  const ent = await getClinicEntitlements(clinicId)
  if (ent.planSlug === LEGACY_PLAN_SLUG) return true
  return ent.features.includes(feature)
}

export async function assertClinicFeature(clinicId: string, feature: PlanFeature) {
  const ok = await clinicHasFeature(clinicId, feature)
  if (!ok) throw new PlanFeatureRequiredError(feature)
}

export async function getClinicLimits(clinicId: string): Promise<PlanLimits> {
  const ent = await getClinicEntitlements(clinicId)
  return ent.limits
}

async function countUsers(clinicId: string) {
  return prisma.userClinic.count({ where: { clinicId, active: true } })
}

async function countDoctors(clinicId: string) {
  const links = await prisma.userClinic.findMany({
    where: { clinicId, active: true },
    select: { user: { select: { role: true, doctorProfile: { select: { id: true } } } } },
  })
  return links.filter((l) => l.user.role === "DOCTOR" || l.user.doctorProfile).length
}

async function countWhatsappConnections(clinicId: string) {
  return prisma.whatsappConnection.count({ where: { clinicId, status: { not: "DISCONNECTED" } } })
}

async function getUsagePeriod(clinicId: string) {
  const key = periodKey()
  return prisma.clinicUsagePeriod.upsert({
    where: { clinicId_periodKey: { clinicId, periodKey: key } },
    create: { clinicId, periodKey: key },
    update: {},
  })
}

export async function getUsage(clinicId: string, limitKey: PlanLimitKey): Promise<number> {
  if (limitKey === "maxUsers") return countUsers(clinicId)
  if (limitKey === "maxDoctors") return countDoctors(clinicId)
  if (limitKey === "maxWhatsappConnections") return countWhatsappConnections(clinicId)
  const usage = await getUsagePeriod(clinicId)
  if (limitKey === "maxAiMessagesPerMonth") return usage.aiMessagesCount
  if (limitKey === "maxAiActionsPerMonth") return usage.aiActionsCount
  if (limitKey === "maxStorageMb") return usage.storageUsedMb
  return 0
}

export async function checkClinicLimit(clinicId: string, limitKey: PlanLimitKey) {
  const ent = await getClinicEntitlements(clinicId)
  if (ent.planSlug === LEGACY_PLAN_SLUG) {
    const current = await getUsage(clinicId, limitKey)
    return { allowed: true, current, max: null as number | null }
  }
  const max = ent.limits[limitKey]
  const current = await getUsage(clinicId, limitKey)
  if (max === null || max === undefined) return { allowed: true, current, max: null }
  return { allowed: current < max, current, max }
}

export async function assertClinicLimit(clinicId: string, limitKey: PlanLimitKey) {
  const check = await checkClinicLimit(clinicId, limitKey)
  if (!check.allowed && check.max != null) {
    throw new PlanLimitReachedError(limitKey, check.current, check.max)
  }
}

export async function incrementAiUsage(clinicId: string, kind: "message" | "action", amount = 1) {
  const key = periodKey()
  await prisma.clinicUsagePeriod.upsert({
    where: { clinicId_periodKey: { clinicId, periodKey: key } },
    create: {
      clinicId,
      periodKey: key,
      aiMessagesCount: kind === "message" ? amount : 0,
      aiActionsCount: kind === "action" ? amount : 0,
    },
    update: {
      aiMessagesCount: kind === "message" ? { increment: amount } : undefined,
      aiActionsCount: kind === "action" ? { increment: amount } : undefined,
    },
  })
}

export async function getClinicUsageSummary(clinicId: string) {
  const limits = await getClinicLimits(clinicId)
  const items: Array<{ key: PlanLimitKey; current: number; max: number | null }> = []
  for (const key of [
    "maxUsers",
    "maxDoctors",
    "maxWhatsappConnections",
    "maxAiMessagesPerMonth",
    "maxAiActionsPerMonth",
    "maxStorageMb",
  ] as PlanLimitKey[]) {
    const current = await getUsage(clinicId, key)
    const max = limits[key] ?? null
    items.push({ key, current, max })
  }
  return items
}

export function mapPlanErrorReply(error: unknown) {
  if (error instanceof PlanFeatureRequiredError) {
    return { status: 403, body: { error: "PLAN_FEATURE_REQUIRED", feature: error.feature } }
  }
  if (error instanceof PlanLimitReachedError) {
    return {
      status: 403,
      body: { error: "PLAN_LIMIT_REACHED", limit: error.limit, current: error.current, max: error.max },
    }
  }
  return null
}

export function computeTrialEnd(start: Date, trialDays: number) {
  return addDays(start, trialDays)
}

export function currentBillingPeriod() {
  const now = new Date()
  return { start: startOfMonth(now), end: endOfMonth(now) }
}
