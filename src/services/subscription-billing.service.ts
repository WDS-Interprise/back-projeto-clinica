import type { BillingCycle } from "@prisma/client"
import prisma from "@/lib/prisma.js"
import * as asaas from "@/lib/asaas.client.js"
import { isAsaasConfigured } from "@/lib/env.js"
import { moneyFromUnknown, roundMoney } from "@/lib/money.js"
import { onlyDigits } from "@/lib/pix-key.js"
import { addDays, addMonths, addYears } from "date-fns"

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function planPrice(plan: { monthlyPrice: unknown; annualPrice: unknown }, cycle: BillingCycle) {
  return cycle === "ANNUAL" ? moneyFromUnknown(plan.annualPrice) : moneyFromUnknown(plan.monthlyPrice)
}

async function ensureClinicAsaasCustomer(clinicId: string) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { clinicId },
    include: { clinic: true },
  })
  if (!sub) throw new Error("NO_SUBSCRIPTION")
  if (sub.asaasCustomerId) return sub.asaasCustomerId

  const created = await asaas.createCustomer({
    name: sub.clinic.name,
    cpfCnpj: sub.clinic.cnpj ? onlyDigits(sub.clinic.cnpj) : undefined,
    email: sub.clinic.email || undefined,
    phone: sub.clinic.phone ? onlyDigits(sub.clinic.phone) : undefined,
    externalReference: `clinic:${clinicId}`,
  })

  await prisma.clinicSubscription.update({
    where: { clinicId },
    data: { asaasCustomerId: created.id },
  })
  return created.id
}

export async function syncAsaasSubscription(subscriptionId: string) {
  if (!isAsaasConfigured()) return null
  const sub = await prisma.clinicSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, clinic: true },
  })
  if (!sub) throw new Error("NOT_FOUND")

  const customerId = await ensureClinicAsaasCustomer(sub.clinicId)
  const value = planPrice(sub.plan, sub.billingCycle)
  if (value <= 0) return sub

  const cycle = sub.billingCycle === "ANNUAL" ? "YEARLY" : "MONTHLY"
  const nextDueDate = sub.currentPeriodEnd?.toISOString().slice(0, 10) ?? todayIsoDate()

  if (sub.asaasSubscriptionId) {
    await asaas.updateSubscription(sub.asaasSubscriptionId, {
      value,
      cycle,
      nextDueDate,
      updatePendingPayments: true,
    })
    return sub
  }

  const created = await asaas.createSubscription({
    customer: customerId,
    value,
    nextDueDate,
    cycle,
    description: `Assinatura ClinMax: ${sub.plan.name}`,
    externalReference: `subscription:${sub.id}`,
    billingType: "PIX",
  })

  return prisma.clinicSubscription.update({
    where: { id: sub.id },
    data: { asaasSubscriptionId: created.id },
  })
}

export async function cancelAsaasSubscription(asaasSubscriptionId: string) {
  if (!isAsaasConfigured()) return
  await asaas.deleteSubscription(asaasSubscriptionId)
}

export async function createManualInvoice(subscriptionId: string, dueDate?: Date) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })
  if (!sub) throw new Error("NOT_FOUND")
  const amount = planPrice(sub.plan, sub.billingCycle)
  const due = dueDate ?? addDays(new Date(), 3)

  if (isAsaasConfigured()) {
    const customerId = await ensureClinicAsaasCustomer(sub.clinicId)
    const payment = await asaas.createPixPayment({
      customer: customerId,
      value: amount,
      dueDate: due.toISOString().slice(0, 10),
      description: `Mensalidade ClinMax: ${sub.plan.name}`,
      externalReference: `subscription-invoice:${sub.id}:${Date.now()}`,
    })
    let qr: { encodedImage?: string; payload?: string } = {}
    try {
      qr = await asaas.getPixQrCode(payment.id)
    } catch {
      // pix pode não estar pronto imediatamente
    }
    return prisma.subscriptionInvoice.create({
      data: {
        clinicSubscriptionId: sub.id,
        clinicId: sub.clinicId,
        asaasPaymentId: payment.id,
        amount,
        status: "PENDING",
        billingType: "PIX",
        dueDate: due,
        pixQrCode: qr.encodedImage ?? null,
        pixCopyPaste: qr.payload ?? null,
        reference: payment.id.slice(-8).toUpperCase(),
      },
    })
  }

  return prisma.subscriptionInvoice.create({
    data: {
      clinicSubscriptionId: sub.id,
      clinicId: sub.clinicId,
      amount,
      status: "PENDING",
      billingType: "MANUAL",
      dueDate: due,
      reference: `MAN-${Date.now().toString(36).toUpperCase()}`,
    },
  })
}

function mapPaymentStatus(status: string): "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "FAILED" | "REFUNDED" {
  if (status === "RECEIVED" || status === "CONFIRMED") return "PAID"
  if (status === "OVERDUE") return "OVERDUE"
  if (status === "REFUNDED") return "REFUNDED"
  if (status === "DELETED" || status === "CANCELLED") return "CANCELLED"
  if (status === "FAILED") return "FAILED"
  return "PENDING"
}

type AsaasPaymentPayload = {
  id?: string
  subscription?: string
  externalReference?: string
  value?: number
  dueDate?: string
  billingType?: string
  status?: string
}

async function ensureInvoiceForAsaasPayment(
  asaasPaymentId: string,
  payment?: AsaasPaymentPayload
) {
  const existing = await prisma.subscriptionInvoice.findUnique({
    where: { asaasPaymentId },
    include: { subscription: { include: { plan: true } } },
  })
  if (existing) return existing

  let remote = payment
  if ((!remote?.subscription && !remote?.externalReference) && isAsaasConfigured()) {
    try {
      remote = (await asaas.getPayment(asaasPaymentId)) as AsaasPaymentPayload
    } catch {
      return null
    }
  }

  const asaasSubId = remote?.subscription
  const externalRef = remote?.externalReference ?? ""
  let sub = asaasSubId
    ? await prisma.clinicSubscription.findFirst({
        where: { asaasSubscriptionId: asaasSubId },
        include: { plan: true },
      })
    : null

  if (!sub && externalRef.startsWith("subscription:")) {
    const subId = externalRef.replace("subscription:", "").split(":")[0]
    if (subId) {
      sub = await prisma.clinicSubscription.findUnique({
        where: { id: subId },
        include: { plan: true },
      })
    }
  }

  if (!sub) return null

  const amount = moneyFromUnknown(remote?.value ?? planPrice(sub.plan, sub.billingCycle))
  const due = remote?.dueDate ? new Date(remote.dueDate) : new Date()

  return prisma.subscriptionInvoice.create({
    data: {
      clinicSubscriptionId: sub.id,
      clinicId: sub.clinicId,
      asaasPaymentId,
      amount,
      status: "PENDING",
      billingType: remote?.billingType ?? "PIX",
      dueDate: due,
      reference: asaasPaymentId.slice(-8).toUpperCase(),
    },
    include: { subscription: { include: { plan: true } } },
  })
}

export async function handleSubscriptionPaymentWebhook(
  asaasPaymentId: string,
  remoteStatus?: string,
  paymentPayload?: AsaasPaymentPayload
) {
  const invoice = await ensureInvoiceForAsaasPayment(asaasPaymentId, paymentPayload)
  if (!invoice) return { handled: false }

  let status = remoteStatus ?? paymentPayload?.status
  if (!status && isAsaasConfigured()) {
    const remote = await asaas.getPayment(asaasPaymentId)
    status = remote.status
  }
  const mapped = mapPaymentStatus(String(status || "PENDING"))

  await prisma.subscriptionInvoice.update({
    where: { id: invoice.id },
    data: {
      status: mapped,
      paidAt: mapped === "PAID" ? new Date() : invoice.paidAt,
    },
  })

  const sub = invoice.subscription
  const now = new Date()
  const nextEnd = sub.billingCycle === "ANNUAL" ? addYears(now, 1) : addMonths(now, 1)

  if (mapped === "PAID") {
    await prisma.clinicSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: nextEnd,
        cancelAtPeriodEnd: false,
      },
    })
  } else if (mapped === "OVERDUE") {
    await prisma.clinicSubscription.update({
      where: { id: sub.id },
      data: { status: "PAST_DUE" },
    })
  }

  return { handled: true, invoiceId: invoice.id, status: mapped }
}

export async function handleSubscriptionPaymentConfirmed(asaasPaymentId: string) {
  return handleSubscriptionPaymentWebhook(asaasPaymentId, "CONFIRMED")
}

export async function handleSubscriptionPaymentReceived(asaasPaymentId: string) {
  return handleSubscriptionPaymentWebhook(asaasPaymentId, "RECEIVED")
}

export async function handleSubscriptionPaymentRefund(asaasPaymentId: string) {
  return handleSubscriptionPaymentWebhook(asaasPaymentId, "REFUNDED")
}

export async function listClinicInvoices(clinicId: string) {
  const rows = await prisma.subscriptionInvoice.findMany({
    where: { clinicId },
    orderBy: { dueDate: "desc" },
    take: 24,
    include: { subscription: { include: { plan: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    amount: moneyFromUnknown(row.amount),
    status: row.status,
    billingType: row.billingType,
    dueDate: row.dueDate.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    invoiceUrl: row.invoiceUrl,
    pixCopyPaste: row.pixCopyPaste,
    pixQrCode: row.pixQrCode,
    reference: row.reference,
    planName: row.subscription.plan.name,
  }))
}

export async function refreshInvoicePix(invoiceId: string, clinicId: string) {
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { id: invoiceId, clinicId },
  })
  if (!invoice?.asaasPaymentId || !isAsaasConfigured()) throw new Error("NOT_AVAILABLE")
  const qr = await asaas.getPixQrCode(invoice.asaasPaymentId)
  return prisma.subscriptionInvoice.update({
    where: { id: invoiceId },
    data: { pixQrCode: qr.encodedImage, pixCopyPaste: qr.payload },
  })
}
