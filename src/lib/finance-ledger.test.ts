import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { applyPaidToAccountBalance, summarizeLedgerPeriod } from "./finance-ledger.js"

describe("livro-caixa", () => {
  it("INCOME PAID aumenta o saldo e PENDING nao entra no caixa", () => {
    const txs = [
      { type: "INCOME" as const, status: "PAID" as const, amount: 100, accountId: "a" },
      { type: "INCOME" as const, status: "PENDING" as const, amount: 50, accountId: "a" },
    ]
    const period = summarizeLedgerPeriod(txs)
    assert.equal(period.incomePaid, 100)
    assert.equal(period.incomePending, 50)
    assert.equal(applyPaidToAccountBalance(10, txs, "a"), 110)
  })

  it("EXPENSE PAID reduz o saldo", () => {
    const txs = [{ type: "EXPENSE" as const, status: "PAID" as const, amount: 40, accountId: "a" }]
    assert.equal(summarizeLedgerPeriod(txs).expensePaid, 40)
    assert.equal(applyPaidToAccountBalance(100, txs, "a"), 60)
  })

  it("TRANSFER nao entra no P&L e move saldo entre contas", () => {
    const txs = [
      {
        type: "TRANSFER" as const,
        status: "PAID" as const,
        amount: 30,
        transferFromId: "a",
        transferToId: "b",
      },
    ]
    const period = summarizeLedgerPeriod(txs)
    assert.equal(period.incomePaid, 0)
    assert.equal(period.expensePaid, 0)
    assert.equal(applyPaidToAccountBalance(100, txs, "a"), 70)
    assert.equal(applyPaidToAccountBalance(0, txs, "b"), 30)
  })

  it("CANCELLED nao entra no saldo nem no P&L", () => {
    const txs = [
      { type: "INCOME" as const, status: "CANCELLED" as const, amount: 80, accountId: "a" },
      { type: "EXPENSE" as const, status: "CANCELLED" as const, amount: 20, accountId: "a" },
    ]
    const period = summarizeLedgerPeriod(txs)
    assert.equal(period.incomePaid, 0)
    assert.equal(period.expensePaid, 0)
    assert.equal(applyPaidToAccountBalance(10, txs, "a"), 10)
  })
})
