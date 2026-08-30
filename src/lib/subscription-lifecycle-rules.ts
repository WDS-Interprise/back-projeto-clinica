import { addDays } from "date-fns"

export type SubscriptionLifecycleStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED"

/**
 * Precedencia de acesso comercial:
 * Legacy (slug) -> cortesia -> status financeiro -> plano -> add-ons/overrides.
 * SUSPENDED bloqueia so modulos gated (WhatsApp, financeiro, TISS, estoque, IA).
 * Login, agenda, pacientes e prontuario permanecem.
 */
export function subscriptionGrantsAccessNow(input: {
  status: SubscriptionLifecycleStatus
  now: Date
  courtesyUntil?: Date | null
  trialEndsAt?: Date | null
  oldestOpenInvoiceDue?: Date | null
  gracePeriodDays: number
}) {
  if (input.courtesyUntil && input.courtesyUntil > input.now) return true
  if (input.status === "ACTIVE") return true
  if (input.status === "TRIAL") {
    if (!input.trialEndsAt) return true
    return input.trialEndsAt > input.now
  }
  if (input.status === "PAST_DUE") {
    if (!input.oldestOpenInvoiceDue) return true
    return input.now <= addDays(input.oldestOpenInvoiceDue, input.gracePeriodDays)
  }
  return false
}

export function shouldSuspendPastDue(input: {
  status: SubscriptionLifecycleStatus
  now: Date
  courtesyUntil?: Date | null
  oldestOpenInvoiceDue?: Date | null
  gracePeriodDays: number
}) {
  if (input.status !== "PAST_DUE") return false
  if (input.courtesyUntil && input.courtesyUntil > input.now) return false
  if (!input.oldestOpenInvoiceDue) return false
  return input.now > addDays(input.oldestOpenInvoiceDue, input.gracePeriodDays)
}

export function shouldMarkPastDue(input: {
  status: SubscriptionLifecycleStatus
  now: Date
  courtesyUntil?: Date | null
  openInvoiceDue?: Date | null
}) {
  if (input.status !== "ACTIVE") return false
  if (input.courtesyUntil && input.courtesyUntil > input.now) return false
  if (!input.openInvoiceDue) return false
  return input.now > input.openInvoiceDue
}

export function shouldExpireTrial(input: {
  status: SubscriptionLifecycleStatus
  now: Date
  courtesyUntil?: Date | null
  trialEndsAt?: Date | null
}) {
  if (input.status !== "TRIAL") return false
  if (input.courtesyUntil && input.courtesyUntil > input.now) return false
  if (!input.trialEndsAt) return false
  return input.trialEndsAt < input.now
}

export function shouldIssueLocalRenewal(input: {
  status: SubscriptionLifecycleStatus
  now: Date
  currentPeriodEnd?: Date | null
  hasOpenInvoice: boolean
  hasAsaasSubscription: boolean
  planPrice: number
}) {
  if (input.planPrice <= 0) return false
  if (input.hasAsaasSubscription) return false
  if (input.hasOpenInvoice) return false
  if (input.status !== "ACTIVE" && input.status !== "PAST_DUE") return false
  if (!input.currentPeriodEnd) return false
  return input.now >= input.currentPeriodEnd
}

export function canRepairPastDueGhost(input: {
  status: SubscriptionLifecycleStatus
  invoiceCount: number
}) {
  return input.status === "PAST_DUE" && input.invoiceCount === 0
}
