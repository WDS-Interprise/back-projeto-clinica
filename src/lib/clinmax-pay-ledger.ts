import { fromCents, roundMoney, toCents } from "@/lib/money.js"

/**
 * Taxa ClinMax Pay: percentual sobre o valor LIQUIDO apos a tarifa Asaas.
 * Nao aplicar sobre o valor bruto da cobranca.
 */
export function computeClinmaxPayLedger(input: {
  amountGross: number
  netAmount: number
  feePercent: number
  outstandingDebit: number
}) {
  const amountGross = roundMoney(input.amountGross)
  const netAmount = roundMoney(input.netAmount)
  const feePercent = Number.isFinite(input.feePercent) ? input.feePercent : 0
  const outstandingDebit = roundMoney(Math.max(0, input.outstandingDebit))

  const gatewayFee = roundMoney(Math.max(0, amountGross - netAmount))
  const platformFee = fromCents(Math.round((toCents(netAmount) * feePercent) / 100))
  const clinicShare = roundMoney(netAmount - platformFee)
  const compensation = roundMoney(Math.min(outstandingDebit, Math.max(0, clinicShare)))
  const clinicPayoutAmount = roundMoney(clinicShare - compensation)

  return {
    amountGross,
    netAmount,
    gatewayFee,
    platformFee,
    clinicShare,
    compensation,
    clinicPayoutAmount,
    outstandingAfter: roundMoney(outstandingDebit - compensation),
  }
}

export function appointmentIncomeOriginKey(appointmentId: string) {
  return `appointment-income:${appointmentId}`
}
