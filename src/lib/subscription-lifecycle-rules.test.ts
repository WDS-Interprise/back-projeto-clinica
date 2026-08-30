import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  canRepairPastDueGhost,
  shouldExpireTrial,
  shouldIssueLocalRenewal,
  shouldMarkPastDue,
  shouldSuspendPastDue,
  subscriptionGrantsAccessNow,
} from "./subscription-lifecycle-rules.js"

const now = new Date("2026-08-30T12:00:00.000Z")

describe("lifecycle de assinatura", () => {
  it("cortesia prevalece sobre SUSPENDED", () => {
    assert.equal(
      subscriptionGrantsAccessNow({
        status: "SUSPENDED",
        now,
        courtesyUntil: new Date("2026-09-01T00:00:00.000Z"),
        gracePeriodDays: 3,
      }),
      true
    )
  })

  it("SUSPENDED sem cortesia nao concede features comerciais", () => {
    assert.equal(
      subscriptionGrantsAccessNow({
        status: "SUSPENDED",
        now,
        gracePeriodDays: 3,
      }),
      false
    )
  })

  it("PAST_DUE no grace permanece com acesso", () => {
    assert.equal(
      subscriptionGrantsAccessNow({
        status: "PAST_DUE",
        now,
        oldestOpenInvoiceDue: new Date("2026-08-29T12:00:00.000Z"),
        gracePeriodDays: 3,
      }),
      true
    )
  })

  it("suspende apos grace de 3 dias", () => {
    assert.equal(
      shouldSuspendPastDue({
        status: "PAST_DUE",
        now,
        oldestOpenInvoiceDue: new Date("2026-08-26T11:00:00.000Z"),
        gracePeriodDays: 3,
      }),
      true
    )
  })

  it("ACTIVE vira PAST_DUE quando a fatura vence", () => {
    assert.equal(
      shouldMarkPastDue({
        status: "ACTIVE",
        now,
        openInvoiceDue: new Date("2026-08-29T12:00:00.000Z"),
      }),
      true
    )
  })

  it("nao repara PAST_DUE quando ja existe invoice", () => {
    assert.equal(canRepairPastDueGhost({ status: "PAST_DUE", invoiceCount: 1 }), false)
    assert.equal(canRepairPastDueGhost({ status: "PAST_DUE", invoiceCount: 0 }), true)
  })

  it("emite renovacao local so sem Asaas e sem fatura aberta", () => {
    assert.equal(
      shouldIssueLocalRenewal({
        status: "ACTIVE",
        now,
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        hasOpenInvoice: false,
        hasAsaasSubscription: false,
        planPrice: 99,
      }),
      true
    )
    assert.equal(
      shouldIssueLocalRenewal({
        status: "ACTIVE",
        now,
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        hasOpenInvoice: false,
        hasAsaasSubscription: true,
        planPrice: 99,
      }),
      false
    )
  })

  it("nao emite renovacao para Legacy (preco 0)", () => {
    assert.equal(
      shouldIssueLocalRenewal({
        status: "ACTIVE",
        now,
        currentPeriodEnd: now,
        hasOpenInvoice: false,
        hasAsaasSubscription: false,
        planPrice: 0,
      }),
      false
    )
  })

  it("expira trial administrativo", () => {
    assert.equal(
      shouldExpireTrial({
        status: "TRIAL",
        now,
        trialEndsAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
      true
    )
  })
})
