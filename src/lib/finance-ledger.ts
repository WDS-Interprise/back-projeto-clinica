import { roundMoney } from "@/lib/money.js"

export type LedgerTxType = "INCOME" | "EXPENSE" | "TRANSFER"
export type LedgerTxStatus = "PAID" | "PENDING" | "CANCELLED"

export type LedgerTx = {
  type: LedgerTxType
  status: LedgerTxStatus
  amount: number
  accountId?: string | null
  transferFromId?: string | null
  transferToId?: string | null
}

export function summarizeLedgerPeriod(txs: LedgerTx[]) {
  let incomePaid = 0
  let incomePending = 0
  let expensePaid = 0
  let expensePending = 0

  for (const tx of txs) {
    if (tx.status === "CANCELLED") continue
    if (tx.type === "TRANSFER") continue
    const amount = roundMoney(tx.amount)
    if (tx.type === "INCOME") {
      if (tx.status === "PAID") incomePaid = roundMoney(incomePaid + amount)
      else incomePending = roundMoney(incomePending + amount)
    } else if (tx.type === "EXPENSE") {
      if (tx.status === "PAID") expensePaid = roundMoney(expensePaid + amount)
      else expensePending = roundMoney(expensePending + amount)
    }
  }

  return {
    incomePaid,
    incomePending,
    expensePaid,
    expensePending,
    balancePeriod: roundMoney(incomePaid - expensePaid),
  }
}

export function applyPaidToAccountBalance(
  initialBalance: number,
  txs: LedgerTx[],
  accountId: string
) {
  let balance = roundMoney(initialBalance)
  for (const tx of txs) {
    if (tx.status !== "PAID") continue
    const amount = roundMoney(tx.amount)
    if (tx.type === "INCOME" && tx.accountId === accountId) balance = roundMoney(balance + amount)
    if (tx.type === "EXPENSE" && tx.accountId === accountId) balance = roundMoney(balance - amount)
    if (tx.type === "TRANSFER") {
      if (tx.transferFromId === accountId) balance = roundMoney(balance - amount)
      if (tx.transferToId === accountId) balance = roundMoney(balance + amount)
    }
  }
  return balance
}
