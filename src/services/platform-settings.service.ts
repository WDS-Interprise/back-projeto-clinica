import prisma from "@/lib/prisma.js"
import { writeAuditLog } from "@/lib/audit-log.js"

export async function getPlatformSettings() {
  const row = await prisma.platformSettings.findUnique({ where: { id: "platform" } })
  if (!row) {
    return {
      defaultPlanId: null,
      defaultTrialDays: 0,
      gracePeriodDays: 3,
      currency: "BRL",
      billingEmail: null,
      newSignupsEnabled: true,
    }
  }
  return {
    defaultPlanId: row.defaultPlanId,
    defaultTrialDays: row.defaultTrialDays,
    gracePeriodDays: row.gracePeriodDays,
    currency: row.currency,
    billingEmail: row.billingEmail,
    newSignupsEnabled: row.newSignupsEnabled,
  }
}

export async function updatePlatformSettings(
  input: Partial<{
    defaultPlanId: string | null
    defaultTrialDays: number
    gracePeriodDays: number
    currency: string
    billingEmail: string | null
    newSignupsEnabled: boolean
  }>,
  actorUserId?: string
) {
  const row = await prisma.platformSettings.upsert({
    where: { id: "platform" },
    create: {
      id: "platform",
      defaultPlanId: input.defaultPlanId ?? undefined,
      defaultTrialDays: input.defaultTrialDays ?? 0,
      gracePeriodDays: input.gracePeriodDays ?? 3,
      currency: input.currency ?? "BRL",
      billingEmail: input.billingEmail ?? null,
      newSignupsEnabled: input.newSignupsEnabled ?? true,
    },
    update: {
      defaultPlanId: input.defaultPlanId,
      defaultTrialDays: input.defaultTrialDays,
      gracePeriodDays: input.gracePeriodDays,
      currency: input.currency,
      billingEmail: input.billingEmail,
      newSignupsEnabled: input.newSignupsEnabled,
    },
  })
  await writeAuditLog({
    userId: actorUserId,
    module: "saas-billing",
    action: "platform-settings-updated",
    description: "Configurações da plataforma atualizadas",
    entityType: "PlatformSettings",
    entityId: row.id,
  })
  return getPlatformSettings()
}
