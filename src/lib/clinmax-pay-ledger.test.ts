import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { computeClinmaxPayLedger, appointmentIncomeOriginKey } from "./clinmax-pay-ledger.js"

describe("ClinMax Pay ledger", () => {
  it("aplica 5% sobre o liquido, nao sobre o bruto", () => {
    const ledger = computeClinmaxPayLedger({
      amountGross: 100,
      netAmount: 99,
      feePercent: 5,
      outstandingDebit: 0,
    })
    assert.equal(ledger.gatewayFee, 1)
    assert.equal(ledger.platformFee, 4.95)
    assert.equal(ledger.clinicShare, 94.05)
    assert.equal(ledger.clinicPayoutAmount, 94.05)
  })

  it("compensa debito pendente de forma parcial", () => {
    const ledger = computeClinmaxPayLedger({
      amountGross: 200,
      netAmount: 200,
      feePercent: 5,
      outstandingDebit: 80,
    })
    assert.equal(ledger.clinicShare, 190)
    assert.equal(ledger.compensation, 80)
    assert.equal(ledger.clinicPayoutAmount, 110)
    assert.equal(ledger.outstandingAfter, 0)
  })

  it("compensa integralmente quando o debito cobre o share", () => {
    const ledger = computeClinmaxPayLedger({
      amountGross: 126.32,
      netAmount: 126.32,
      feePercent: 5,
      outstandingDebit: 200,
    })
    assert.equal(ledger.clinicShare, 120)
    assert.equal(ledger.compensation, 120)
    assert.equal(ledger.clinicPayoutAmount, 0)
    assert.equal(ledger.outstandingAfter, 80)
  })

  it("usa a mesma chave de origem para receipt e Pay", () => {
    assert.equal(appointmentIncomeOriginKey("apt-1"), "appointment-income:apt-1")
  })
})
