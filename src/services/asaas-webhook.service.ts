import prisma from "@/lib/prisma.js"
import * as clinmaxPay from "@/services/clinmax-pay.service.js"
import * as subscriptionBilling from "@/services/subscription-billing.service.js"
import { ASAAS_WEBHOOK_TOKEN } from "@/lib/env.js"
import { assertAsaasWebhookToken, routeAsaasWebhookDomain } from "@/lib/asaas-webhook-auth.js"

/**
 * Roteador central de webhooks Asaas.
 * Lookup por ID registrado no banco: PlatformPayment (ClinMax Pay) vs SubscriptionInvoice (SaaS).
 */
export async function handleAsaasWebhook(body: Record<string, unknown>, token: string | undefined) {
  assertAsaasWebhookToken(token, ASAAS_WEBHOOK_TOKEN)

  const event = String(body.event || "")
  const payment = body.payment as { id?: string; subscription?: string; externalReference?: string } | undefined
  const transfer = body.transfer as { id?: string; status?: string; externalReference?: string; failReason?: string } | undefined
  const eventKey = String(body.id || `${event}:${payment?.id || transfer?.id || "unknown"}`)

  try {
    await prisma.asaasWebhookEvent.create({ data: { eventKey, event } })
  } catch {
    return { ok: true, duplicate: true }
  }

  try {
    const [platformPayment, subscriptionInvoice] = payment?.id
      ? await Promise.all([
          prisma.platformPayment.findUnique({ where: { asaasPaymentId: payment.id }, select: { id: true } }),
          prisma.subscriptionInvoice.findUnique({ where: { asaasPaymentId: payment.id }, select: { id: true } }),
        ])
      : [null, null]

    const domain = routeAsaasWebhookDomain({
      event,
      paymentId: payment?.id,
      hasPlatformPayment: Boolean(platformPayment),
      hasSubscriptionInvoice: Boolean(subscriptionInvoice),
      asaasSubscription: payment?.subscription,
      externalReference: payment?.externalReference,
      hasTransfer: Boolean(transfer?.id),
    })

    if (domain === "ambiguous") {
      throw new Error(`WEBHOOK_AMBIGUOUS_PAYMENT:${payment?.id}`)
    }

    if (domain === "saas-billing" && payment?.id) {
      const payPayload = payment as Record<string, unknown>
      if (event === "PAYMENT_CONFIRMED") {
        await subscriptionBilling.handleSubscriptionPaymentConfirmed(payment.id)
      } else if (event === "PAYMENT_RECEIVED") {
        await subscriptionBilling.handleSubscriptionPaymentReceived(payment.id)
      } else if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") {
        await subscriptionBilling.handleSubscriptionPaymentRefund(payment.id)
      } else if (event === "PAYMENT_OVERDUE") {
        await subscriptionBilling.handleSubscriptionPaymentWebhook(payment.id, "OVERDUE", payPayload)
      } else if (event === "PAYMENT_CREATED") {
        await subscriptionBilling.handleSubscriptionPaymentWebhook(payment.id, "PENDING", payPayload)
      }
      return { ok: true, domain: "saas-billing" }
    }

    if (domain === "clinmax-pay") {
      return clinmaxPay.processPayWebhookEvent(event, payment, transfer)
    }

    return { ok: true, ignored: true }
  } catch (err) {
    await prisma.asaasWebhookEvent.deleteMany({ where: { eventKey } })
    throw err
  }
}
