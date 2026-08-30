import type { PixKeyType, PlatformPayoutStatus } from "@prisma/client"
import prisma from "@/lib/prisma.js"
import { CLINMAX_PAY_FEE_PERCENT, isAsaasConfigured } from "@/lib/env.js"
import * as asaas from "@/lib/asaas.client.js"
import { moneyFromUnknown, roundMoney } from "@/lib/money.js"
import {
  detectPixKeyType,
  maskPixKey,
  normalizePixKey,
  onlyDigits,
  validateRecipientDocument,
} from "@/lib/pix-key.js"
import type { AuthContext } from "@/types/index.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import { computeClinmaxPayLedger } from "@/lib/clinmax-pay-ledger.js"
import { assertAsaasWebhookToken } from "@/lib/asaas-webhook-auth.js"
import { syncAppointmentIncome } from "@/services/finance.service.js"
import { ASAAS_WEBHOOK_TOKEN } from "@/lib/env.js"

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function presentRecipient(row: {
  enabled: boolean
  pixKey: string
  pixKeyType: PixKeyType
  recipientName: string
  recipientDocument: string
  verifiedAt: Date | null
  status: string
  platformFeePercent: unknown
  outstandingDebit: unknown
}) {
  return {
    enabled: row.enabled,
    pixKeyMasked: maskPixKey(row.pixKey, row.pixKeyType),
    pixKeyType: row.pixKeyType,
    recipientName: row.recipientName,
    recipientDocumentMasked: `${"•".repeat(Math.max(0, onlyDigits(row.recipientDocument).length - 2))}${onlyDigits(row.recipientDocument).slice(-2)}`,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    status: row.status,
    platformFeePercent: moneyFromUnknown(row.platformFeePercent),
    outstandingDebit: moneyFromUnknown(row.outstandingDebit),
    asaasConfigured: isAsaasConfigured(),
  }
}

export async function getPaySettings(ctx: AuthContext) {
  const row = await prisma.clinicPixRecipient.findUnique({ where: { clinicId: ctx.clinicId } })
  if (!row) {
    return {
      enabled: false,
      pixKeyMasked: null,
      pixKeyType: null,
      recipientName: null,
      recipientDocumentMasked: null,
      verifiedAt: null,
      status: "PENDING",
      platformFeePercent: CLINMAX_PAY_FEE_PERCENT,
      outstandingDebit: 0,
      asaasConfigured: isAsaasConfigured(),
    }
  }
  return presentRecipient(row)
}

export async function upsertPixRecipient(
  ctx: AuthContext,
  input: {
    pixKey: string
    pixKeyType?: PixKeyType
    recipientName: string
    recipientDocument: string
    enabled?: boolean
    confirmed: boolean
  }
) {
  if (!input.confirmed) throw new Error("PIX_NOT_CONFIRMED")
  const name = input.recipientName.trim()
  if (name.length < 3) throw new Error("INVALID_RECIPIENT_NAME")
  const type = input.pixKeyType || detectPixKeyType(input.pixKey)
  if (!type) throw new Error("INVALID_PIX_KEY")
  const pixKey = normalizePixKey(input.pixKey, type)
  const document = onlyDigits(input.recipientDocument)
  if (!validateRecipientDocument(document, type, pixKey) && (type === "CPF" || type === "CNPJ")) {
    throw new Error("DOCUMENT_KEY_MISMATCH")
  }
  if (document.length !== 11 && document.length !== 14) throw new Error("INVALID_DOCUMENT")

  const row = await prisma.clinicPixRecipient.upsert({
    where: { clinicId: ctx.clinicId },
    create: {
      clinicId: ctx.clinicId,
      pixKey,
      pixKeyType: type,
      recipientName: name,
      recipientDocument: document,
      enabled: input.enabled ?? true,
      status: "VERIFIED",
      verifiedAt: new Date(),
      platformFeePercent: CLINMAX_PAY_FEE_PERCENT,
    },
    update: {
      pixKey,
      pixKeyType: type,
      recipientName: name,
      recipientDocument: document,
      enabled: input.enabled ?? true,
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  })
  await writeAuditLog({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    module: "clinmax-pay",
    action: "pix-recipient-upsert",
    description: "Chave Pix de recebimento atualizada",
    entityType: "ClinicPixRecipient",
    entityId: row.id,
  })
  return presentRecipient(row)
}

export async function setPayEnabled(ctx: AuthContext, enabled: boolean) {
  const row = await prisma.clinicPixRecipient.findUnique({ where: { clinicId: ctx.clinicId } })
  if (!row) throw new Error("PIX_NOT_CONFIGURED")
  if (enabled && row.status !== "VERIFIED") throw new Error("PIX_NOT_VERIFIED")
  const updated = await prisma.clinicPixRecipient.update({
    where: { clinicId: ctx.clinicId },
    data: { enabled },
  })
  return presentRecipient(updated)
}

export async function getAppointmentPay(ctx: AuthContext, appointmentId: string) {
  const payment = await prisma.platformPayment.findFirst({
    where: { clinicId: ctx.clinicId, appointmentId },
    include: { payout: true },
    orderBy: { createdAt: "desc" },
  })
  return presentCharge(payment)
}

function presentCharge(payment: any) {
  if (!payment) return null
  return {
    id: payment.id,
    status: payment.status,
    amountGross: moneyFromUnknown(payment.amountGross),
    gatewayFee: moneyFromUnknown(payment.gatewayFee),
    netAmount: moneyFromUnknown(payment.netAmount),
    platformFee: moneyFromUnknown(payment.platformFee),
    clinicPayout: moneyFromUnknown(payment.clinicPayoutAmount),
    compensationApplied: moneyFromUnknown(payment.compensationApplied),
    pixPayload: payment.pixPayload,
    pixEncodedImage: payment.pixEncodedImage,
    pixExpirationDate: payment.pixExpirationDate?.toISOString() ?? null,
    payoutStatus: payment.payout?.status ?? null,
    payoutAmount: payment.payout ? moneyFromUnknown(payment.payout.amount) : null,
    payoutFailReason: payment.payout?.failReason ?? null,
  }
}

export async function chargeAppointment(ctx: AuthContext, appointmentId: string, amount?: number) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
    include: { billing: true, patient: true },
  })
  if (!appointment) throw new Error("NOT_FOUND")

  const recipient = await prisma.clinicPixRecipient.findUnique({ where: { clinicId: ctx.clinicId } })
  const value = roundMoney(amount ?? moneyFromUnknown(appointment.billing?.totalAmount))
  if (value <= 0) throw new Error("INVALID_AMOUNT")

  await prisma.appointmentBilling.upsert({
    where: { appointmentId },
    create: { appointmentId, totalAmount: value, chargedAmount: value, billingStatus: "CHARGED" },
    update: { chargedAmount: value, billingStatus: "CHARGED" },
  })

  if (!recipient?.enabled || recipient.status !== "VERIFIED") {
    return { mode: "local" as const, billingStatus: "CHARGED", amount: value, pay: null }
  }
  if (!isAsaasConfigured()) throw new Error("ASAAS_NOT_CONFIGURED")
  if (!appointment.patient) throw new Error("PATIENT_REQUIRED")

  const open = await prisma.platformPayment.findFirst({
    where: { appointmentId, status: { in: ["PENDING", "CONFIRMED"] } },
    include: { payout: true },
  })
  if (open?.pixPayload) {
    return { mode: "pix" as const, billingStatus: "CHARGED", amount: value, pay: presentCharge(open) }
  }

  const customerId = await ensureAsaasCustomer(appointment.patient)
  const payment = await asaas.createPixPayment({
    customer: customerId,
    value,
    dueDate: todayIsoDate(),
    description: `Consulta ${appointment.patient.name}`,
    externalReference: appointmentId,
  })
  const qr = await asaas.getPixQrCode(payment.id)
  const row = await prisma.platformPayment.create({
    data: {
      clinicId: ctx.clinicId,
      appointmentId,
      asaasPaymentId: payment.id,
      asaasCustomerId: customerId,
      amountGross: value,
      netAmount: value,
      status: "PENDING",
      pixPayload: qr.payload,
      pixEncodedImage: qr.encodedImage,
      pixExpirationDate: qr.expirationDate ? new Date(qr.expirationDate) : null,
    },
    include: { payout: true },
  })
  await writeAuditLog({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    module: "clinmax-pay",
    action: "charge-pix",
    description: "Cobrança Pix ClinMax Pay gerada",
    entityType: "PlatformPayment",
    entityId: row.id,
    metadata: { asaasPaymentId: payment.id, value },
  })
  return { mode: "pix" as const, billingStatus: "CHARGED", amount: value, pay: presentCharge(row) }
}

async function ensureAsaasCustomer(patient: {
  id: string
  name: string
  email: string | null
  phone: string
  cpf: string | null
  asaasCustomerId: string | null
}) {
  if (patient.asaasCustomerId) return patient.asaasCustomerId
  const created = await asaas.createCustomer({
    name: patient.name,
    cpfCnpj: patient.cpf ? onlyDigits(patient.cpf) : undefined,
    email: patient.email || undefined,
    phone: onlyDigits(patient.phone) || undefined,
    externalReference: patient.id,
  })
  await prisma.patient.update({ where: { id: patient.id }, data: { asaasCustomerId: created.id } })
  return created.id
}

export async function receiptAppointment(ctx: AuthContext, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
    include: {
      billing: true,
      procedures: { select: { procedureId: true }, take: 1 },
    },
  })
  if (!appointment) throw new Error("NOT_FOUND")

  const billing = await prisma.appointmentBilling.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      billingStatus: "RECEIVED",
      receivedAt: new Date(),
      chargedAmount: appointment.billing?.totalAmount ?? 0,
    },
    update: { billingStatus: "RECEIVED", receivedAt: new Date() },
  })

  const payReceived = await prisma.platformPayment.findFirst({
    where: { appointmentId, clinicId: ctx.clinicId, status: { in: ["RECEIVED"] } },
    select: { id: true },
  })
  if (!payReceived) {
    const amount = moneyFromUnknown(appointment.billing?.chargedAmount || appointment.billing?.totalAmount)
    await syncAppointmentIncome({
      clinicId: ctx.clinicId,
      appointmentId,
      createdById: ctx.userId,
      amount,
      description: "Recebimento de consulta",
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      procedureId: appointment.procedures[0]?.procedureId ?? null,
      notes: `receipt:${appointmentId}`,
    })
  }

  await writeAuditLog({
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    module: "finance",
    action: "appointment-receipt",
    description: "Consulta marcada como recebida",
    entityType: "Appointment",
    entityId: appointmentId,
  })
  return billing
}

export async function handleAsaasWebhook(
  body: Record<string, unknown>,
  token: string | undefined,
  opts?: { alreadyRecorded?: boolean }
) {
  if (!opts?.alreadyRecorded) {
    assertAsaasWebhookToken(token, ASAAS_WEBHOOK_TOKEN)
  }

  const event = String(body.event || "")
  const payment = body.payment as { id?: string } | undefined
  const transfer = body.transfer as { id?: string; status?: string; externalReference?: string; failReason?: string } | undefined
  const eventKey = String(body.id || `${event}:${payment?.id || transfer?.id || "unknown"}`)

  if (!opts?.alreadyRecorded) {
    try {
      await prisma.asaasWebhookEvent.create({ data: { eventKey, event } })
    } catch {
      return { ok: true, duplicate: true }
    }
  }

  try {
    return await processPayWebhookEvent(event, payment, transfer)
  } catch (err) {
    if (!opts?.alreadyRecorded) {
      await prisma.asaasWebhookEvent.deleteMany({ where: { eventKey } })
    }
    throw err
  }
}

export async function processPayWebhookEvent(
  event: string,
  payment?: { id?: string },
  transfer?: { id?: string; status?: string; externalReference?: string; failReason?: string }
) {
  if (event === "PAYMENT_CONFIRMED" && payment?.id) {
    await markPaymentConfirmed(payment.id)
  } else if (event === "PAYMENT_RECEIVED" && payment?.id) {
    await processPaymentReceived(payment.id)
  } else if ((event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") && payment?.id) {
    await processPaymentRefund(payment.id)
  } else if (event.startsWith("TRANSFER_") && transfer?.id) {
    await processTransferEvent(transfer)
  }
  return { ok: true, domain: "clinmax-pay" as const }
}

async function markPaymentConfirmed(asaasPaymentId: string) {
  await prisma.platformPayment.updateMany({
    where: { asaasPaymentId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  })
}

async function processPaymentReceived(asaasPaymentId: string) {
  const remote = await asaas.getPayment(asaasPaymentId)
  const payment = await prisma.platformPayment.findUnique({
    where: { asaasPaymentId },
    include: { payout: true, clinic: { include: { pixRecipient: true } } },
  })
  if (!payment) return
  if (payment.status === "REFUNDED") return

  const recipient = payment.clinic.pixRecipient
  if (!recipient) throw new Error("PIX_NOT_CONFIGURED")

  if (payment.status === "RECEIVED") {
    await ensurePayoutDispatched(payment, recipient)
    return
  }

  const amountGross = moneyFromUnknown(remote.value ?? payment.amountGross)
  const netAmount = moneyFromUnknown(remote.netValue ?? amountGross)
  const feePercent = moneyFromUnknown(recipient.platformFeePercent) || CLINMAX_PAY_FEE_PERCENT
  const outstanding = moneyFromUnknown(recipient.outstandingDebit)
  const ledger = computeClinmaxPayLedger({
    amountGross,
    netAmount,
    feePercent,
    outstandingDebit: outstanding,
  })

  await prisma.$transaction(async (tx) => {
    await tx.platformPayment.update({
      where: { id: payment.id },
      data: {
        amountGross: ledger.amountGross,
        gatewayFee: ledger.gatewayFee,
        netAmount: ledger.netAmount,
        platformFee: ledger.platformFee,
        clinicPayoutAmount: ledger.clinicPayoutAmount,
        compensationApplied: ledger.compensation,
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    })
    await tx.appointmentBilling.updateMany({
      where: { appointmentId: payment.appointmentId },
      data: { billingStatus: "RECEIVED", receivedAt: new Date(), chargedAmount: amountGross },
    })
    if (ledger.compensation > 0) {
      await tx.clinicPixRecipient.update({
        where: { clinicId: payment.clinicId },
        data: { outstandingDebit: ledger.outstandingAfter },
      })
    }
  })

  await ensurePayoutDispatched(
    { ...payment, payout: payment.payout, clinicPayoutAmount: ledger.clinicPayoutAmount as unknown as typeof payment.clinicPayoutAmount },
    recipient,
    ledger.clinicPayoutAmount
  )
}

async function ensurePayoutDispatched(
  payment: {
    id: string
    clinicId: string
    payout: { id: string; status: PlatformPayoutStatus; asaasTransferId: string | null } | null
    clinicPayoutAmount?: unknown
  },
  recipient: { pixKey: string; pixKeyType: PixKeyType },
  clinicPayoutAmountOverride?: number
) {
  const clinicPayoutAmount =
    clinicPayoutAmountOverride ?? moneyFromUnknown(payment.clinicPayoutAmount)
  const existing = payment.payout ?? (await prisma.platformPayout.findUnique({ where: { paymentId: payment.id } }))
  if (existing) {
    if (existing.status === "PAID" || existing.status === "CANCELLED") return
    if (existing.asaasTransferId && existing.status === "PROCESSING") return
    if (clinicPayoutAmount >= 0.01) {
      await dispatchTransfer(existing.id, recipient, clinicPayoutAmount, payment.id)
    } else {
      await recordClinicIncome(payment.id)
    }
    return
  }

  const payout = await prisma.platformPayout.create({
    data: {
      paymentId: payment.id,
      clinicId: payment.clinicId,
      amount: clinicPayoutAmount,
      pixKey: recipient.pixKey,
      pixKeyType: recipient.pixKeyType,
      externalReference: payment.id,
      status: clinicPayoutAmount < 0.01 ? "PAID" : "PENDING",
      paidAt: clinicPayoutAmount < 0.01 ? new Date() : null,
    },
  })

  if (clinicPayoutAmount >= 0.01) {
    await dispatchTransfer(payout.id, recipient, clinicPayoutAmount, payment.id)
  } else {
    await recordClinicIncome(payment.id)
  }
}

async function dispatchTransfer(
  payoutId: string,
  recipient: { pixKey: string; pixKeyType: PixKeyType },
  amount: number,
  paymentId: string
) {
  await prisma.platformPayout.update({
    where: { id: payoutId },
    data: { status: "PROCESSING" },
  })
  try {
    const transfer = await asaas.createPixTransfer({
      value: amount,
      pixAddressKey: recipient.pixKey,
      pixAddressKeyType: recipient.pixKeyType,
      description: "Repasse ClinMax Pay",
      externalReference: paymentId,
    })
    const mapped = mapTransferStatus(transfer.status)
    await prisma.platformPayout.update({
      where: { id: payoutId },
      data: {
        asaasTransferId: transfer.id,
        status: mapped,
        failReason: transfer.failReason || null,
        paidAt: mapped === "PAID" ? new Date() : null,
      },
    })
    if (mapped === "PAID") await recordClinicIncome(paymentId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no repasse"
    await prisma.platformPayout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failReason: message },
    })
    throw err
  }
}

function mapTransferStatus(status: string): PlatformPayoutStatus {
  if (status === "DONE") return "PAID"
  if (status === "BANK_PROCESSING") return "PROCESSING"
  if (status === "CANCELLED") return "CANCELLED"
  if (status === "FAILED") return "FAILED"
  return "PENDING"
}

async function processTransferEvent(transfer: {
  id?: string
  status?: string
  externalReference?: string
  failReason?: string
}) {
  if (!transfer.id) return
  const payout = await prisma.platformPayout.findFirst({
    where: { OR: [{ asaasTransferId: transfer.id }, { externalReference: transfer.externalReference || "" }] },
  })
  if (!payout) return
  const mapped = mapTransferStatus(String(transfer.status || "PENDING"))
  await prisma.platformPayout.update({
    where: { id: payout.id },
    data: {
      asaasTransferId: transfer.id,
      status: mapped,
      failReason: transfer.failReason || payout.failReason,
      paidAt: mapped === "PAID" ? new Date() : payout.paidAt,
    },
  })
  if (mapped === "PAID") await recordClinicIncome(payout.paymentId)
}

async function processPaymentRefund(asaasPaymentId: string) {
  const payment = await prisma.platformPayment.findUnique({
    where: { asaasPaymentId },
    include: { payout: true, clinic: { include: { pixRecipient: true } } },
  })
  if (!payment) return

  await prisma.platformPayment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED", refundedAt: new Date() },
  })

  const payout = payment.payout
  if (!payout || payout.status === "PENDING" || payout.status === "PROCESSING") {
    let cancelFailed = false
    if (payout?.asaasTransferId && payout.status !== "PAID") {
      try {
        await asaas.cancelTransfer(payout.asaasTransferId)
      } catch {
        cancelFailed = true
      }
    }
    if (cancelFailed && payout) {
      const amount = moneyFromUnknown(payout.amount)
      if (amount > 0) {
        const current = moneyFromUnknown(payment.clinic.pixRecipient?.outstandingDebit)
        await prisma.clinicPixRecipient.update({
          where: { clinicId: payment.clinicId },
          data: { outstandingDebit: roundMoney(current + amount) },
        })
      }
      return
    }
    if (payout) {
      await prisma.platformPayout.update({
        where: { id: payout.id },
        data: { status: "CANCELLED" },
      })
    }
    return
  }

  if (payout.status === "PAID") {
    const amount = moneyFromUnknown(payout.amount)
    if (amount > 0) {
      const current = moneyFromUnknown(payment.clinic.pixRecipient?.outstandingDebit)
      await prisma.clinicPixRecipient.update({
        where: { clinicId: payment.clinicId },
        data: { outstandingDebit: roundMoney(current + amount) },
      })
    }
  }
}

async function recordClinicIncome(paymentId: string) {
  const payment = await prisma.platformPayment.findUnique({
    where: { id: paymentId },
    include: { appointment: true, payout: true },
  })
  if (!payment?.payout || moneyFromUnknown(payment.payout.amount) < 0.01) return

  const pixMethod = await prisma.paymentMethod.findFirst({
    where: { clinicId: payment.clinicId, name: { contains: "PIX" } },
  })
  const admin = await prisma.userClinic.findFirst({
    where: { clinicId: payment.clinicId, active: true },
    select: { userId: true },
  })
  if (!admin) return

  await syncAppointmentIncome({
    clinicId: payment.clinicId,
    appointmentId: payment.appointmentId,
    createdById: admin.userId,
    amount: moneyFromUnknown(payment.payout.amount),
    description: "Recebimento ClinMax Pay",
    patientId: payment.appointment.patientId,
    doctorId: payment.appointment.doctorId,
    notes: `clinmax-pay:${payment.id}`,
    paymentMethodId: pixMethod?.id ?? null,
  })
}
