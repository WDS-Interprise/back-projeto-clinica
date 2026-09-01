import { timingSafeEqual } from "crypto"

export function tokensEqual(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    if (a.length > 0) timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

export function assertAsaasWebhookToken(
  token: string | undefined,
  expected: string,
  nodeEnv = process.env.NODE_ENV || "development"
) {
  const provided = token ?? ""
  if (!expected) {
    if (nodeEnv === "production") throw new Error("WEBHOOK_UNAUTHORIZED")
    return
  }
  if (!tokensEqual(provided, expected)) throw new Error("WEBHOOK_UNAUTHORIZED")
}

export type AsaasWebhookDomain = "saas-billing" | "clinmax-pay" | "ambiguous" | "ignored"

export function routeAsaasWebhookDomain(input: {
  event: string
  paymentId?: string
  hasPlatformPayment: boolean
  hasSubscriptionInvoice: boolean
  asaasSubscription?: string
  externalReference?: string
  hasTransfer: boolean
}): AsaasWebhookDomain {
  if (input.paymentId) {
    if (input.hasPlatformPayment && input.hasSubscriptionInvoice) return "ambiguous"
    if (input.hasSubscriptionInvoice) return "saas-billing"
    const subRef = String(input.asaasSubscription ?? "")
    const extRef = String(input.externalReference ?? "")
    if (subRef || extRef.startsWith("subscription:") || extRef.startsWith("upgrade:")) return "saas-billing"
    if (input.hasPlatformPayment) return "clinmax-pay"
  }
  if (input.event.startsWith("TRANSFER_") && input.hasTransfer) return "clinmax-pay"
  return "ignored"
}
