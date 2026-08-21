import prisma from "@/lib/prisma.js"
import * as clinmaxPay from "@/services/clinmax-pay.service.js"
import * as subscriptionBilling from "@/services/subscription-billing.service.js"

/**
 * Roteador central de webhooks Asaas.
 * Lookup por ID registrado no banco: PlatformPayment (ClinMax Pay) vs SubscriptionInvoice (SaaS).
 */
export async function handleAsaasWebhook(body: Record<string, unknown>, token: string | undefined) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || ""
  if (expected && token !== expected) throw new Error("WEBHOOK_UNAUTHORIZED")

  const event = String(body.event || "")
  const payment = body.payment as { id?: string } | undefined
  const transfer = body.transfer as { id?: string; status?: string; externalReference?: string; failReason?: string } | undefined
  const eventKey = String(body.id || `${event}:${payment?.id || transfer?.id || "unknown"}`)

  try {
    await prisma.asaasWebhookEvent.create({ data: { eventKey, event } })
  } catch {
    return { ok: true, duplicate: true }
  }

  try {
    if (payment?.id) {
      const [platformPayment, subscriptionInvoice] = await Promise.all([
        prisma.platformPayment.findUnique({ where: { asaasPaymentId: payment.id }, select: { id: true } }),
        prisma.subscriptionInvoice.findUnique({ where: { asaasPaymentId: payment.id }, select: { id: true } }),
      ])

      if (platformPayment && subscriptionInvoice) {
        throw new Error(`WEBHOOK_AMBIGUOUS_PAYMENT:${payment.id}`)
      }

      if (subscriptionInvoice) {
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

      // Cobrança recorrente Asaas sem invoice pré-registrada
      const payPayload = payment as Record<string, unknown>
      const subRef = String(payPayload.subscription ?? "")
      const extRef = String(payPayload.externalReference ?? "")
      if (subRef || extRef.startsWith("subscription:")) {
        if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
          await subscriptionBilling.handleSubscriptionPaymentWebhook(
            payment.id,
            event === "PAYMENT_RECEIVED" ? "RECEIVED" : "CONFIRMED",
            payPayload
          )
        } else if (event === "PAYMENT_OVERDUE") {
          await subscriptionBilling.handleSubscriptionPaymentWebhook(payment.id, "OVERDUE", payPayload)
        } else if (event === "PAYMENT_CREATED") {
          await subscriptionBilling.handleSubscriptionPaymentWebhook(payment.id, "PENDING", payPayload)
        }
        return { ok: true, domain: "saas-billing" }
      }

      if (platformPayment) {
        // Delega fluxo ClinMax Pay existente (sem reprocessar idempotência)
        await prisma.asaasWebhookEvent.deleteMany({ where: { eventKey } })
        return clinmaxPay.handleAsaasWebhook(body, token)
      }
    }

    if (event.startsWith("TRANSFER_") && transfer?.id) {
      // Transferências pertencem ao ClinMax Pay
      await prisma.asaasWebhookEvent.deleteMany({ where: { eventKey } })
      return clinmaxPay.handleAsaasWebhook(body, token)
    }

    return { ok: true, ignored: true }
  } catch (err) {
    await prisma.asaasWebhookEvent.deleteMany({ where: { eventKey } })
    throw err
  }
}
