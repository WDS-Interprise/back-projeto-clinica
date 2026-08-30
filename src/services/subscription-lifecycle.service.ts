import { addDays, addMonths } from "date-fns"
import prisma from "@/lib/prisma.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import { moneyFromUnknown } from "@/lib/money.js"
import { LEGACY_PLAN_SLUG } from "@/lib/plan-features.js"
import {
  shouldExpireTrial,
  shouldMarkPastDue,
  shouldSuspendPastDue,
  shouldIssueLocalRenewal,
} from "@/lib/subscription-lifecycle-rules.js"
import { issueCommercialInvoice } from "@/services/subscription-billing.service.js"

/**
 * Atualiza status de assinaturas: trial, faturas vencidas, grace, suspensao e renovacao local.
 * Idempotente. Roda no boot e no scheduler periodico.
 */
export async function runSubscriptionLifecycle() {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
  const graceDays = settings?.gracePeriodDays ?? 3
  const now = new Date()

  const backfilled = await backfillCommercialBilling(now)

  const trialSubs = await prisma.clinicSubscription.findMany({
    where: { status: "TRIAL" },
  })
  let expiredTrials = 0
  for (const sub of trialSubs) {
    if (
      !shouldExpireTrial({
        status: sub.status,
        now,
        courtesyUntil: sub.courtesyUntil,
        trialEndsAt: sub.trialEndsAt,
      })
    ) {
      continue
    }
    await prisma.clinicSubscription.update({
      where: { id: sub.id },
      data: { status: "EXPIRED" },
    })
    await writeAuditLog({
      module: "saas-billing",
      action: "trial-expired",
      description: `Trial expirado: assinatura ${sub.id}`,
      entityType: "ClinicSubscription",
      entityId: sub.id,
    })
    expiredTrials += 1
  }

  const activeSubs = await prisma.clinicSubscription.findMany({
    where: { status: "ACTIVE" },
    include: {
      plan: true,
      invoices: {
        where: {
          status: { in: ["OVERDUE", "PENDING"] },
          NOT: { reference: { startsWith: "upgrade:" } },
        },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
  })

  let markedPastDue = 0
  for (const sub of activeSubs) {
    const oldest = sub.invoices[0]
    if (
      shouldMarkPastDue({
        status: sub.status,
        now,
        courtesyUntil: sub.courtesyUntil,
        openInvoiceDue: oldest?.dueDate ?? null,
      })
    ) {
      await prisma.clinicSubscription.update({
        where: { id: sub.id },
        data: { status: "PAST_DUE" },
      })
      markedPastDue += 1
    }

    if (
      shouldIssueLocalRenewal({
        status: sub.status,
        now,
        currentPeriodEnd: sub.currentPeriodEnd,
        hasOpenInvoice: Boolean(oldest),
        hasAsaasSubscription: Boolean(sub.asaasSubscriptionId),
        planPrice: moneyFromUnknown(sub.plan.monthlyPrice),
      })
    ) {
      await issueCommercialInvoice(sub.id, `renewal:${sub.billingCycle}`).catch((err) => {
        console.warn("[SaaS Billing] renovacao local falhou:", sub.id, err)
      })
    }
  }

  const pastDue = await prisma.clinicSubscription.findMany({
    where: { status: "PAST_DUE" },
    include: {
      invoices: {
        where: { status: { in: ["OVERDUE", "PENDING"] }, NOT: { reference: { startsWith: "upgrade:" } } },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
  })

  let suspended = 0
  for (const sub of pastDue) {
    const oldest = sub.invoices[0]
    if (
      !shouldSuspendPastDue({
        status: sub.status,
        now,
        courtesyUntil: sub.courtesyUntil,
        oldestOpenInvoiceDue: oldest?.dueDate ?? null,
        gracePeriodDays: graceDays,
      })
    ) {
      continue
    }
    await prisma.clinicSubscription.update({
      where: { id: sub.id },
      data: { status: "SUSPENDED" },
    })
    await writeAuditLog({
      module: "saas-billing",
      action: "subscription-suspended",
      description: `Assinatura suspensa por inadimplencia: ${sub.id}`,
      entityType: "ClinicSubscription",
      entityId: sub.id,
    })
    suspended += 1
  }

  await logBillingReconciliation(now)

  return {
    expiredTrials,
    markedPastDue,
    suspended,
    backfilled,
  }
}

async function backfillCommercialBilling(now: Date) {
  const subs = await prisma.clinicSubscription.findMany({
    where: {
      invoices: { none: {} },
      plan: { slug: { not: LEGACY_PLAN_SLUG } },
    },
    include: { plan: true },
  })
  let count = 0
  for (const sub of subs) {
    if (moneyFromUnknown(sub.plan.monthlyPrice) <= 0) continue
    if (!sub.currentPeriodEnd) {
      await prisma.clinicSubscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: sub.currentPeriodStart ?? now,
          currentPeriodEnd: addMonths(now, 1),
        },
      })
    }
    await issueCommercialInvoice(sub.id, `signup:${sub.billingCycle}`).catch((err) => {
      console.warn("[SaaS Billing] backfill invoice falhou:", sub.id, err)
    })
    count += 1
  }
  return count
}

async function logBillingReconciliation(now: Date) {
  const stalePayouts = await prisma.platformPayout.count({
    where: {
      status: "PROCESSING",
      createdAt: { lt: addDays(now, -2) },
    },
  })
  const activeOutsidePeriod = await prisma.clinicSubscription.count({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { lt: now },
      asaasSubscriptionId: null,
    },
  })
  if (stalePayouts || activeOutsidePeriod) {
    console.warn(
      JSON.stringify({
        event: "billing-reconciliation",
        stalePayoutsProcessing: stalePayouts,
        activeOutsidePeriod,
      })
    )
  }
}
