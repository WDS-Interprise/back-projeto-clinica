import { addDays } from "date-fns"
import prisma from "@/lib/prisma.js"
import { writeAuditLog } from "@/lib/audit-log.js"

/**
 * Atualiza status de assinaturas com trial expirado ou inadimplência além do grace period.
 * Executado no boot da API (idempotente).
 */
export async function runSubscriptionLifecycle() {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
  const graceDays = settings?.gracePeriodDays ?? 3
  const now = new Date()

  const expiredTrials = await prisma.clinicSubscription.findMany({
    where: {
      status: "TRIAL",
      trialEndsAt: { lt: now },
      OR: [{ courtesyUntil: null }, { courtesyUntil: { lt: now } }],
    },
  })

  for (const sub of expiredTrials) {
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
  }

  const pastDue = await prisma.clinicSubscription.findMany({
    where: { status: "PAST_DUE" },
    include: {
      invoices: {
        where: { status: { in: ["OVERDUE", "PENDING"] } },
        orderBy: { dueDate: "asc" },
        take: 1,
      },
    },
  })

  for (const sub of pastDue) {
    if (sub.courtesyUntil && sub.courtesyUntil > now) continue
    const oldest = sub.invoices[0]
    if (!oldest) continue
    const suspendAfter = addDays(oldest.dueDate, graceDays)
    if (now <= suspendAfter) continue

    await prisma.clinicSubscription.update({
      where: { id: sub.id },
      data: { status: "SUSPENDED" },
    })
    await writeAuditLog({
      module: "saas-billing",
      action: "subscription-suspended",
      description: `Assinatura suspensa por inadimplência: ${sub.id}`,
      entityType: "ClinicSubscription",
      entityId: sub.id,
    })
  }

  return {
    expiredTrials: expiredTrials.length,
    suspended: pastDue.filter((sub) => {
      if (sub.courtesyUntil && sub.courtesyUntil > now) return false
      const oldest = sub.invoices[0]
      if (!oldest) return false
      return now > addDays(oldest.dueDate, graceDays)
    }).length,
  }
}
