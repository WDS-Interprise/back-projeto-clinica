import type { BillingCycle, SubscriptionStatus } from "@prisma/client"
import prisma from "@/lib/prisma.js"
import { moneyFromUnknown, roundMoney } from "@/lib/money.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import { parsePlanFeatures, parsePlanLimits, LEGACY_PLAN_SLUG } from "@/lib/plan-features.js"
import {
  isCommercialRankUpgrade,
  isNextCommercialUpgrade,
  nextCommercialPlanSlug,
} from "@/lib/plan-catalog.js"
import { computeTrialEnd, getClinicUsageSummary } from "@/lib/plan-entitlements.js"
import { canRepairPastDueGhost } from "@/lib/subscription-lifecycle-rules.js"
import * as billing from "@/services/subscription-billing.service.js"

function presentSubscription(row: {
  id: string
  clinicId: string
  planId: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  startedAt: Date
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  cancelledAt: Date | null
  courtesyUntil: Date | null
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null
  requestedPlanSlug?: string | null
  createdAt: Date
  updatedAt: Date
  plan: {
    id: string
    name: string
    slug: string
    monthlyPrice: unknown
    annualPrice: unknown
    featuresJson: string
    limitsJson: string
  }
  clinic?: { id: string; name: string; active: boolean; createdAt: Date }
  invoices?: Array<{
    id: string
    amount: unknown
    status: string
    dueDate: Date
    paidAt: Date | null
  }>
}) {
  const price =
    row.billingCycle === "ANNUAL"
      ? moneyFromUnknown(row.plan.annualPrice)
      : moneyFromUnknown(row.plan.monthlyPrice)
  const lastPaid = row.invoices?.find((i) => i.status === "PAID")
  return {
    id: row.id,
    clinicId: row.clinicId,
    clinicName: row.clinic?.name,
    clinicActive: row.clinic?.active,
    planId: row.planId,
    planName: row.plan.name,
    planSlug: row.plan.slug,
    status: row.status,
    billingCycle: row.billingCycle,
    price,
    startedAt: row.startedAt.toISOString(),
    trialStartedAt: row.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    courtesyUntil: row.courtesyUntil?.toISOString() ?? null,
    asaasCustomerId: row.asaasCustomerId,
    asaasSubscriptionId: row.asaasSubscriptionId,
    requestedPlanSlug: row.requestedPlanSlug ?? null,
    nextBillingAt: row.currentPeriodEnd?.toISOString() ?? row.trialEndsAt?.toISOString() ?? null,
    lastPaymentAt: lastPaid?.paidAt?.toISOString() ?? null,
    pendingUpgrade: null as null | {
      planId: string
      planName: string
      billingCycle: BillingCycle
      amount: number
      invoiceId: string
    },
    features: parsePlanFeatures(row.plan.featuresJson),
    limits: parsePlanLimits(row.plan.limitsJson),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listSubscriptions(filters?: { status?: string; search?: string }) {
  const where: Record<string, unknown> = {}
  if (filters?.status && filters.status !== "ALL") {
    where.status = filters.status
  }
  if (filters?.search?.trim()) {
    where.clinic = { name: { contains: filters.search.trim() } }
  }
  const rows = await prisma.clinicSubscription.findMany({
    where,
    include: {
      plan: true,
      clinic: { select: { id: true, name: true, active: true, createdAt: true } },
      invoices: { orderBy: { dueDate: "desc" }, take: 3 },
    },
    orderBy: { updatedAt: "desc" },
  })
  return rows.map(presentSubscription)
}

export async function getSubscriptionById(id: string) {
  const row = await prisma.clinicSubscription.findUnique({
    where: { id },
    include: {
      plan: true,
      clinic: { select: { id: true, name: true, active: true, createdAt: true } },
      invoices: { orderBy: { dueDate: "desc" } },
    },
  })
  return row ? presentSubscription(row) : null
}

export async function getSubscriptionByClinicId(clinicId: string) {
  const row = await prisma.clinicSubscription.findUnique({
    where: { clinicId },
    include: {
      plan: true,
      clinic: { select: { id: true, name: true, active: true, createdAt: true } },
      invoices: { orderBy: { dueDate: "desc" }, take: 12 },
    },
  })
  if (!row) return null

  const invoiceCount = await prisma.subscriptionInvoice.count({ where: { clinicSubscriptionId: row.id } })
  if (canRepairPastDueGhost({ status: row.status, invoiceCount })) {
    const repaired = await prisma.clinicSubscription.update({
      where: { id: row.id },
      data: { status: "ACTIVE" },
      include: {
        plan: true,
        clinic: { select: { id: true, name: true, active: true, createdAt: true } },
        invoices: { orderBy: { dueDate: "desc" }, take: 12 },
      },
    })
    return attachPendingUpgrade(presentSubscription(repaired), repaired.invoices)
  }

  return attachPendingUpgrade(presentSubscription(row), row.invoices)
}

async function attachPendingUpgrade(
  view: ReturnType<typeof presentSubscription>,
  invoices: Array<{ id: string; amount: unknown; status: string; reference?: string | null }>
) {
  const pending = invoices.find(
    (inv) => (inv.status === "PENDING" || inv.status === "OVERDUE") && inv.reference?.startsWith("upgrade:")
  )
  if (!pending) return view
  const parsed = billing.parseUpgradeReference(pending.reference)
  if (!parsed) return view
  const plan = await prisma.plan.findUnique({ where: { id: parsed.planId } })
  return {
    ...view,
    pendingUpgrade: {
      planId: parsed.planId,
      planName: plan?.name ?? "plano superior",
      billingCycle: parsed.billingCycle,
      amount: moneyFromUnknown(pending.amount),
      invoiceId: pending.id,
    },
  }
}

export async function changePlan(
  subscriptionId: string,
  planId: string,
  actorUserId?: string,
  opts?: {
    billingCycle?: BillingCycle
    paymentMethod?: "PIX" | "CREDIT_CARD"
    remoteIp?: string
    creditCard?: {
      holderName: string
      number: string
      expiryMonth: string
      expiryYear: string
      ccv: string
    }
    creditCardHolderInfo?: {
      name: string
      email: string
      cpfCnpj: string
      postalCode: string
      addressNumber: string
      phone: string
    }
    allowNonSequential?: boolean
  }
) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, clinic: true },
  })
  if (!sub) throw new Error("NOT_FOUND")
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.active) throw new Error("PLAN_NOT_AVAILABLE")

  const rankUpgrade = isCommercialRankUpgrade(sub.plan.slug, plan.slug)
  if (rankUpgrade && !opts?.allowNonSequential && !isNextCommercialUpgrade(sub.plan.slug, plan.slug)) {
    const nextSlug = nextCommercialPlanSlug(sub.plan.slug)
    throw new Error(nextSlug ? `PLAN_UPGRADE_NOT_SEQUENTIAL:${nextSlug}` : "PLAN_UPGRADE_NOT_SEQUENTIAL")
  }

  const billingCycle = opts?.billingCycle ?? sub.billingCycle
  const currentPrice =
    sub.billingCycle === "ANNUAL"
      ? moneyFromUnknown(sub.plan.annualPrice)
      : moneyFromUnknown(sub.plan.monthlyPrice)
  const nextPrice =
    billingCycle === "ANNUAL" ? moneyFromUnknown(plan.annualPrice) : moneyFromUnknown(plan.monthlyPrice)
  const isUpgrade =
    (nextPrice > currentPrice || rankUpgrade) && plan.slug !== LEGACY_PLAN_SLUG

  if (isUpgrade) {
    await billing.cancelPendingUpgradeInvoices(sub.id)

    const restored =
      sub.status === "PAST_DUE" || sub.status === "SUSPENDED" ? "ACTIVE" : sub.status

    const updated = await prisma.clinicSubscription.update({
      where: { id: subscriptionId },
      data: { status: restored },
      include: { plan: true, clinic: true, invoices: { orderBy: { dueDate: "desc" }, take: 12 } },
    })

    await billing.createManualInvoice(updated.id, new Date(), {
      planId: plan.id,
      billingCycle,
      reference: `upgrade:${plan.id}:${billingCycle}`,
      description: `Upgrade ClinMax: ${sub.plan.name} para ${plan.name}`,
      paymentMethod: opts?.paymentMethod ?? "PIX",
      remoteIp: opts?.remoteIp,
      creditCard: opts?.creditCard,
      creditCardHolderInfo: opts?.creditCardHolderInfo,
    })

    await writeAuditLog({
      clinicId: sub.clinicId,
      userId: actorUserId,
      module: "saas-billing",
      action: "subscription-upgrade-requested",
      description: `Upgrade solicitado de ${sub.plan.name} para ${plan.name}. Plano atual permanece até o pagamento.`,
      entityType: "ClinicSubscription",
      entityId: sub.id,
      metadata: { fromPlanId: sub.planId, toPlanId: planId, billingCycle },
    })

    return getSubscriptionByClinicId(sub.clinicId)
  }

  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: {
      planId,
      billingCycle,
      ...(sub.status === "PAST_DUE" ? { status: "ACTIVE" as const } : {}),
    },
    include: { plan: true, clinic: true, invoices: { orderBy: { dueDate: "desc" }, take: 3 } },
  })

  if (updated.asaasSubscriptionId) {
    await billing.syncAsaasSubscription(updated.id).catch(() => undefined)
  }

  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "subscription-plan-changed",
    description: `Plano alterado de ${sub.plan.name} para ${plan.name}`,
    entityType: "ClinicSubscription",
    entityId: sub.id,
    metadata: { fromPlanId: sub.planId, toPlanId: planId },
  })

  return presentSubscription(updated)
}

export async function extendTrial(subscriptionId: string, days: number, actorUserId?: string) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) throw new Error("NOT_FOUND")
  const base = sub.trialEndsAt ?? new Date()
  const trialEndsAt = computeTrialEnd(base, days)
  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: "TRIAL",
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
    },
    include: { plan: true, clinic: true, invoices: { take: 3, orderBy: { dueDate: "desc" } } },
  })
  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "trial-extended",
    description: `Trial estendido em ${days} dias`,
    entityType: "ClinicSubscription",
    entityId: sub.id,
  })
  return presentSubscription(updated)
}

export async function grantCourtesy(subscriptionId: string, until: Date, actorUserId?: string) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) throw new Error("NOT_FOUND")
  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: { courtesyUntil: until, status: "ACTIVE", cancelAtPeriodEnd: false },
    include: { plan: true, clinic: true, invoices: { take: 3, orderBy: { dueDate: "desc" } } },
  })
  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "courtesy-granted",
    description: `Cortesia até ${until.toLocaleDateString("pt-BR")}`,
    entityType: "ClinicSubscription",
    entityId: sub.id,
  })
  return presentSubscription(updated)
}

export async function cancelSubscription(subscriptionId: string, actorUserId?: string, atPeriodEnd = true) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) throw new Error("NOT_FOUND")
  if (sub.asaasSubscriptionId) {
    await billing.cancelAsaasSubscription(sub.asaasSubscriptionId).catch(() => undefined)
  }
  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: {
      cancelAtPeriodEnd: atPeriodEnd,
      cancelledAt: atPeriodEnd ? null : new Date(),
      status: atPeriodEnd ? sub.status : "CANCELLED",
    },
    include: { plan: true, clinic: true, invoices: { take: 3, orderBy: { dueDate: "desc" } } },
  })
  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "subscription-cancelled",
    description: atPeriodEnd ? "Cancelamento ao fim do período" : "Assinatura cancelada",
    entityType: "ClinicSubscription",
    entityId: sub.id,
  })
  return presentSubscription(updated)
}

export async function reactivateSubscription(subscriptionId: string, actorUserId?: string) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) throw new Error("NOT_FOUND")
  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      cancelledAt: null,
    },
    include: { plan: true, clinic: true, invoices: { take: 3, orderBy: { dueDate: "desc" } } },
  })
  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "subscription-reactivated",
    description: "Assinatura reativada",
    entityType: "ClinicSubscription",
    entityId: sub.id,
  })
  return presentSubscription(updated)
}

export async function suspendSubscription(subscriptionId: string, actorUserId?: string) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) throw new Error("NOT_FOUND")
  const updated = await prisma.clinicSubscription.update({
    where: { id: subscriptionId },
    data: { status: "SUSPENDED" },
    include: { plan: true, clinic: true, invoices: { take: 3, orderBy: { dueDate: "desc" } } },
  })
  await writeAuditLog({
    clinicId: sub.clinicId,
    userId: actorUserId,
    module: "saas-billing",
    action: "subscription-suspended",
    description: "Assinatura suspensa",
    entityType: "ClinicSubscription",
    entityId: sub.id,
  })
  return presentSubscription(updated)
}

export async function cancelPendingUpgradeByClinic(clinicId: string, actorUserId?: string) {
  const sub = await prisma.clinicSubscription.findUnique({ where: { clinicId } })
  if (!sub) throw new Error("NOT_FOUND")
  const count = await billing.cancelPendingUpgradeInvoices(sub.id)
  if (count) {
    await writeAuditLog({
      clinicId,
      userId: actorUserId,
      module: "saas-billing",
      action: "subscription-upgrade-cancelled",
      description: "Cobrança de upgrade cancelada. O plano atual permanece ativo.",
      entityType: "ClinicSubscription",
      entityId: sub.id,
    })
  }
  return getSubscriptionByClinicId(clinicId)
}

export async function requestPlanChangeByClinic(
  clinicId: string,
  planId: string,
  billingCycle: BillingCycle,
  extra?: Omit<NonNullable<Parameters<typeof changePlan>[3]>, "billingCycle">
) {
  return changePlan(
    (await prisma.clinicSubscription.findUniqueOrThrow({ where: { clinicId } })).id,
    planId,
    undefined,
    { billingCycle, ...extra }
  )
}

export async function getClinicDetail(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      subscription: { include: { plan: true, invoices: { orderBy: { dueDate: "desc" }, take: 12 } } },
      _count: {
        select: {
          users: true,
          patients: true,
          appointments: true,
          whatsappConnections: true,
        },
      },
      whatsappConnections: { select: { id: true, status: true, name: true } },
      pixRecipient: { select: { enabled: true, status: true } },
      whatsappSettings: { select: { aiAssistantEnabled: true } },
    },
  })
  if (!clinic) return null

  const doctors = await prisma.userClinic.count({
    where: { clinicId, active: true, user: { OR: [{ role: "DOCTOR" }, { doctorProfile: { isNot: null } }] } },
  })

  const usage = await getClinicUsageSummary(clinicId)
  const subscription = clinic.subscription
    ? presentSubscription({ ...clinic.subscription, clinic: { id: clinic.id, name: clinic.name, active: clinic.active, createdAt: clinic.createdAt } })
    : null

  return {
    id: clinic.id,
    name: clinic.name,
    active: clinic.active,
    phone: clinic.phone,
    email: clinic.email,
    createdAt: clinic.createdAt.toISOString(),
    counts: {
      users: clinic._count.users,
      patients: clinic._count.patients,
      appointments: clinic._count.appointments,
      doctors,
      whatsappConnections: clinic._count.whatsappConnections,
    },
    subscription,
    recentInvoices:
      clinic.subscription?.invoices.map((inv) => ({
        id: inv.id,
        amount: moneyFromUnknown(inv.amount),
        status: inv.status,
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt?.toISOString() ?? null,
      })) ?? [],
    usage,
    integrations: {
      whatsapp: clinic.whatsappConnections.map((c) => ({ id: c.id, name: c.name, status: c.status })),
      clinmaxPay: clinic.pixRecipient
        ? { enabled: clinic.pixRecipient.enabled, status: clinic.pixRecipient.status }
        : null,
      ai: clinic.whatsappSettings?.aiAssistantEnabled ?? false,
    },
  }
}

export async function listInvoices(filters?: { status?: string; search?: string }) {
  const where: Record<string, unknown> = {}
  if (filters?.status && filters.status !== "ALL") where.status = filters.status
  if (filters?.search?.trim()) {
    where.clinic = { name: { contains: filters.search.trim() } }
  }
  const rows = await prisma.subscriptionInvoice.findMany({
    where,
    include: {
      clinic: { select: { id: true, name: true } },
      subscription: { include: { plan: true } },
    },
    orderBy: { dueDate: "desc" },
    take: 200,
  })
  return rows.map((row) => ({
    id: row.id,
    clinicId: row.clinicId,
    clinicName: row.clinic.name,
    planName: row.subscription.plan.name,
    reference: row.reference ?? row.id.slice(-8).toUpperCase(),
    amount: moneyFromUnknown(row.amount),
    status: row.status,
    billingType: row.billingType,
    dueDate: row.dueDate.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    asaasPaymentId: row.asaasPaymentId,
    invoiceUrl: row.invoiceUrl,
    pixCopyPaste: row.pixCopyPaste,
  }))
}

export async function getBillingSummary() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [paidMonth, pending, overdue, receivedMonth] = await Promise.all([
    prisma.subscriptionInvoice.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.subscriptionInvoice.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
    }),
    prisma.subscriptionInvoice.aggregate({
      where: { status: "OVERDUE" },
      _sum: { amount: true },
    }),
    prisma.subscriptionInvoice.findMany({
      where: { status: "PAID", paidAt: { gte: monthStart, lte: monthEnd } },
      select: { amount: true },
    }),
  ])

  const activeSubs = await prisma.clinicSubscription.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
    include: { plan: true },
  })
  let mrr = 0
  for (const sub of activeSubs) {
    if (sub.status === "TRIAL") continue
    const monthly =
      sub.billingCycle === "ANNUAL"
        ? roundMoney(moneyFromUnknown(sub.plan.annualPrice) / 12)
        : moneyFromUnknown(sub.plan.monthlyPrice)
    mrr += monthly
  }

  return {
    mrr: roundMoney(mrr),
    arr: roundMoney(mrr * 12),
    revenueMonth: moneyFromUnknown(paidMonth._sum.amount),
    receivable: moneyFromUnknown(pending._sum.amount),
    overdue: moneyFromUnknown(overdue._sum.amount),
    receivedMonth: receivedMonth.reduce((s, i) => s + moneyFromUnknown(i.amount), 0),
    activeSubscriptions: activeSubs.filter((s) => s.status === "ACTIVE").length,
    trialSubscriptions: activeSubs.filter((s) => s.status === "TRIAL").length,
    pastDueSubscriptions: activeSubs.filter((s) => s.status === "PAST_DUE").length,
  }
}
