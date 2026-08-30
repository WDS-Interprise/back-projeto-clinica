import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { assertAsaasWebhookToken, routeAsaasWebhookDomain } from "./asaas-webhook-auth.js"

describe("webhook Asaas", () => {
  it("rejeita token vazio em production", () => {
    assert.throws(() => assertAsaasWebhookToken("abc", "", "production"), /WEBHOOK_UNAUTHORIZED/)
  })

  it("rejeita token diferente", () => {
    assert.throws(() => assertAsaasWebhookToken("wrong", "secret", "development"), /WEBHOOK_UNAUTHORIZED/)
  })

  it("aceita token igual", () => {
    assert.doesNotThrow(() => assertAsaasWebhookToken("secret", "secret", "production"))
  })

  it("roteia Pay vs SaaS sem misturar", () => {
    assert.equal(
      routeAsaasWebhookDomain({
        event: "PAYMENT_RECEIVED",
        paymentId: "pay_1",
        hasPlatformPayment: true,
        hasSubscriptionInvoice: false,
        hasTransfer: false,
      }),
      "clinmax-pay"
    )
    assert.equal(
      routeAsaasWebhookDomain({
        event: "PAYMENT_RECEIVED",
        paymentId: "pay_2",
        hasPlatformPayment: false,
        hasSubscriptionInvoice: true,
        hasTransfer: false,
      }),
      "saas-billing"
    )
    assert.equal(
      routeAsaasWebhookDomain({
        event: "PAYMENT_RECEIVED",
        paymentId: "pay_3",
        hasPlatformPayment: true,
        hasSubscriptionInvoice: true,
        hasTransfer: false,
      }),
      "ambiguous"
    )
    assert.equal(
      routeAsaasWebhookDomain({
        event: "PAYMENT_CREATED",
        paymentId: "pay_4",
        hasPlatformPayment: false,
        hasSubscriptionInvoice: false,
        asaasSubscription: "sub_1",
        hasTransfer: false,
      }),
      "saas-billing"
    )
    assert.equal(
      routeAsaasWebhookDomain({
        event: "TRANSFER_DONE",
        hasPlatformPayment: false,
        hasSubscriptionInvoice: false,
        hasTransfer: true,
      }),
      "clinmax-pay"
    )
  })
})
