import type { BillingCycle } from "@prisma/client"
import prisma from "@/lib/prisma.js"
import * as asaas from "@/lib/asaas.client.js"
import { AsaasApiError } from "@/lib/asaas.client.js"
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

export class BillingRequirementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingRequirementError"
  }
}

async function resolveClinicTaxId(clinicId: string, clinic: { cnpj: string | null }) {
  const fromClinic = clinic.cnpj ? onlyDigits(clinic.cnpj) : ""
  if (fromClinic.length === 11 || fromClinic.length === 14) return fromClinic

  const pix = await prisma.clinicPixRecipient.findUnique({
    where: { clinicId },
    select: { recipientDocument: true },
  })
  const fromPix = pix?.recipientDocument ? onlyDigits(pix.recipientDocument) : ""
  if (fromPix.length === 11 || fromPix.length === 14) return fromPix

  const admin = await prisma.userClinic.findFirst({
    where: { clinicId, active: true, isClinicAdmin: true, user: { cpf: { not: null } } },
    select: { user: { select: { cpf: true } } },
    orderBy: { createdAt: "asc" },
  })
  const fromAdmin = admin?.user.cpf ? onlyDigits(admin.user.cpf) : ""
  if (fromAdmin.length === 11 || fromAdmin.length === 14) return fromAdmin

  return ""
}

async function ensureClinicAsaasCustomer(clinicId: string) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { clinicId },
    include: { clinic: true },
  })
  if (!sub) throw new Error("NO_SUBSCRIPTION")

  const taxId = await resolveClinicTaxId(clinicId, sub.clinic)
  if (!taxId) {
    throw new BillingRequirementError(
      "Informe o CNPJ da clínica (ou o CPF do responsável) nas configurações para gerar o Pix da assinatura."
    )
  }

  const payload = {
    name: sub.clinic.name,
    cpfCnpj: taxId,
    email: sub.clinic.email || undefined,
    phone: sub.clinic.phone ? onlyDigits(sub.clinic.phone) : undefined,
  }

  if (sub.asaasCustomerId) {
    await asaas.updateCustomer(sub.asaasCustomerId, payload)
    return sub.asaasCustomerId
  }

  const created = await asaas.createCustomer({
    ...payload,
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

export async function createManualInvoice(
  subscriptionId: string,
  dueDate?: Date,
  opts?: {
    planId?: string
    billingCycle?: BillingCycle
    reference?: string
    description?: string
    paymentMethod?: "PIX" | "CREDIT_CARD"
    remoteIp?: string
    creditCard?: asaas.AsaasCreditCard
    creditCardHolderInfo?: asaas.AsaasCreditCardHolder
  }
) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })
  if (!sub) throw new Error("NOT_FOUND")
  const targetPlan = opts?.planId
    ? await prisma.plan.findUnique({ where: { id: opts.planId } })
    : sub.plan
  if (!targetPlan) throw new Error("PLAN_NOT_FOUND")
  const cycle = opts?.billingCycle ?? sub.billingCycle
  const amount = planPrice(targetPlan, cycle)
  const due = dueDate ?? addDays(new Date(), 3)
  const description = opts?.description ?? `Mensalidade ClinMax: ${targetPlan.name}`
  const reference = opts?.reference
  const paymentMethod = opts?.paymentMethod ?? "PIX"

  if (isAsaasConfigured()) {
    try {
      const customerId = await ensureClinicAsaasCustomer(sub.clinicId)
      if (paymentMethod === "CREDIT_CARD") {
        const remoteIp = opts?.remoteIp || "127.0.0.1"
        const payment = await asaas.createCreditCardPayment({
          customer: customerId,
          value: amount,
          dueDate: due.toISOString().slice(0, 10),
          description,
          externalReference: reference ?? `subscription-invoice:${sub.id}:${Date.now()}`,
          remoteIp,
          creditCard: opts?.creditCard,
          creditCardHolderInfo: opts?.creditCardHolderInfo,
        })
        const mapped = mapPaymentStatus(payment.status)
        const invoice = await prisma.subscriptionInvoice.create({
          data: {
            clinicSubscriptionId: sub.id,
            clinicId: sub.clinicId,
            asaasPaymentId: payment.id,
            amount,
            status: mapped,
            billingType: "CREDIT_CARD",
            dueDate: due,
            paidAt: mapped === "PAID" ? new Date() : null,
            invoiceUrl: payment.invoiceUrl ?? null,
            reference: reference ?? payment.id.slice(-8).toUpperCase(),
          },
        })
        if (mapped === "PAID") {
          await handleSubscriptionPaymentWebhook(payment.id, payment.status)
        }
        return invoice
      }

      try {
        const pixReady = await asaas.hasActivePixAddressKey()
        if (!pixReady) {
          throw new BillingRequirementError(
            "A conta Asaas nao tem chave Pix ativa. Cadastre uma chave Pix no Asaas e gere o pagamento de novo."
          )
        }
        const cadastro = await asaas.getAccountRegistrationStatus()
        if (cadastro.bankAccountInfo && cadastro.bankAccountInfo !== "APPROVED") {
          throw new BillingRequirementError(
            "A conta bancaria no Asaas ainda esta pendente. O banco recusa o Pix ate o Asaas aprovar a conta bancaria no painel."
          )
        }
      } catch (err) {
        if (err instanceof BillingRequirementError) throw err
      }

      const paymentRef = reference ?? `subscription-invoice:${sub.id}:${Date.now()}`
      const staticQr = await asaas.createTrackedStaticPix({
        value: amount,
        description,
        externalReference: paymentRef,
      })
      return prisma.subscriptionInvoice.create({
        data: {
          clinicSubscriptionId: sub.id,
          clinicId: sub.clinicId,
          asaasPaymentId: staticQr.trackingId,
          amount,
          status: "PENDING",
          billingType: "PIX",
          dueDate: due,
          pixQrCode: staticQr.encodedImage || null,
          pixCopyPaste: staticQr.payload,
          invoiceUrl: null,
          reference: paymentRef,
        },
      })
    } catch (err) {
      if (err instanceof BillingRequirementError) throw err
      if (err instanceof AsaasApiError) throw new BillingRequirementError(err.message)
      throw err
    }
  }

  return prisma.subscriptionInvoice.create({
    data: {
      clinicSubscriptionId: sub.id,
      clinicId: sub.clinicId,
      amount,
      status: "PENDING",
      billingType: "MANUAL",
      dueDate: due,
      reference: reference ?? `MAN-${Date.now().toString(36).toUpperCase()}`,
    },
  })
}

export async function cancelPendingUpgradeInvoices(clinicSubscriptionId: string) {
  const invoices = await prisma.subscriptionInvoice.findMany({
    where: {
      clinicSubscriptionId,
      status: { in: ["PENDING", "OVERDUE"] },
      reference: { startsWith: "upgrade:" },
    },
  })
  for (const inv of invoices) {
    if (inv.asaasPaymentId && isAsaasConfigured()) {
      await releaseAsaasCharge(inv.asaasPaymentId)
    }
  }
  if (invoices.length) {
    await prisma.subscriptionInvoice.updateMany({
      where: { id: { in: invoices.map((inv) => inv.id) } },
      data: { status: "CANCELLED" },
    })
  }
  return invoices.length
}

export function parseUpgradeReference(reference: string | null | undefined) {
  if (!reference?.startsWith("upgrade:")) return null
  const parts = reference.split(":")
  if (parts.length < 3) return null
  const planId = parts[1]
  const billingCycle = parts[2] === "ANNUAL" ? "ANNUAL" : "MONTHLY"
  return { planId, billingCycle: billingCycle as BillingCycle }
}

export async function issueCommercialInvoice(
  subscriptionId: string,
  reference: string,
  description?: string
) {
  const sub = await prisma.clinicSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })
  if (!sub) return null
  const amount = planPrice(sub.plan, sub.billingCycle)
  if (amount <= 0) return null

  const open = await prisma.subscriptionInvoice.findFirst({
    where: { clinicSubscriptionId: subscriptionId, status: { in: ["PENDING", "OVERDUE"] } },
  })
  if (open) return open

  try {
    return await createManualInvoice(subscriptionId, addDays(new Date(), 3), {
      reference,
      description: description ?? `Mensalidade ClinMax: ${sub.plan.name}`,
    })
  } catch {
    return prisma.subscriptionInvoice.create({
      data: {
        clinicSubscriptionId: sub.id,
        clinicId: sub.clinicId,
        amount,
        status: "PENDING",
        billingType: "MANUAL",
        dueDate: addDays(new Date(), 3),
        reference,
      },
    })
  }
}

export async function ensurePendingPaymentForSubscription(subscriptionId: string) {
  const pending = await prisma.subscriptionInvoice.findFirst({
    where: { clinicSubscriptionId: subscriptionId, status: { in: ["PENDING", "OVERDUE"] } },
    orderBy: { dueDate: "desc" },
  })
  if (pending) {
    if (pending.asaasPaymentId && isAsaasConfigured() && !pending.pixQrCode) {
      try {
        return await refreshInvoicePix(pending.id, pending.clinicId)
      } catch {
        return pending
      }
    }
    return pending
  }
  return createManualInvoice(subscriptionId, new Date())
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
  pixQrCodeId?: string
  value?: number
  dueDate?: string
  billingType?: string
  status?: string
}

async function releaseAsaasCharge(asaasPaymentId: string) {
  const qrId = asaas.parsePixQrTrackingId(asaasPaymentId)
  if (qrId) {
    await asaas.deleteStaticPixQr(qrId).catch(() => undefined)
    return
  }
  await asaas.deletePayment(asaasPaymentId).catch(() => undefined)
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
  if (
    (!remote?.subscription && !remote?.externalReference && !remote?.pixQrCodeId) &&
    isAsaasConfigured()
  ) {
    try {
      remote = (await asaas.getPayment(asaasPaymentId)) as AsaasPaymentPayload
    } catch {
      return null
    }
  }

  if (remote?.pixQrCodeId) {
    const byQr = await prisma.subscriptionInvoice.findUnique({
      where: { asaasPaymentId: asaas.pixQrTrackingId(remote.pixQrCodeId) },
      include: { subscription: { include: { plan: true } } },
    })
    if (byQr) {
      return prisma.subscriptionInvoice.update({
        where: { id: byQr.id },
        data: { asaasPaymentId },
        include: { subscription: { include: { plan: true } } },
      })
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

  if (externalRef.startsWith("upgrade:")) {
    const pending = await prisma.subscriptionInvoice.findFirst({
      where: { reference: externalRef, status: { in: ["PENDING", "OVERDUE"] } },
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
    })
    if (pending) {
      return prisma.subscriptionInvoice.update({
        where: { id: pending.id },
        data: { asaasPaymentId },
        include: { subscription: { include: { plan: true } } },
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
  if (invoice.status === "PAID" && mapped === "PAID") {
    await syncAsaasSubscription(invoice.clinicSubscriptionId).catch((err) => {
      console.warn("[SaaS Billing] syncAsaasSubscription after PAID failed:", err)
    })
    return { handled: true, invoiceId: invoice.id, status: mapped, duplicate: true }
  }
  const previousStatus = invoice.status

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: mapped,
        paidAt: mapped === "PAID" ? new Date() : invoice.paidAt,
      },
    })

    const sub = invoice.subscription
    const now = new Date()

    if (mapped === "PAID") {
      const upgrade = parseUpgradeReference(invoice.reference)
      const periodCycle = upgrade?.billingCycle ?? sub.billingCycle
      const nextEnd = periodCycle === "ANNUAL" ? addYears(now, 1) : addMonths(now, 1)
      await tx.clinicSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          ...(upgrade
            ? { planId: upgrade.planId, billingCycle: upgrade.billingCycle }
            : {}),
          currentPeriodStart: now,
          currentPeriodEnd: nextEnd,
          cancelAtPeriodEnd: false,
        },
      })
    } else if (mapped === "OVERDUE") {
      const upgrade = parseUpgradeReference(invoice.reference)
      if (!upgrade) {
        await tx.clinicSubscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE" },
        })
      }
    }
  })

  console.log(
    JSON.stringify({
      event: "subscription-invoice-status",
      clinicId: invoice.clinicId,
      subscriptionId: invoice.clinicSubscriptionId,
      invoiceId: invoice.id,
      asaasPaymentId,
      previousStatus,
      newStatus: mapped,
      amount: moneyFromUnknown(invoice.amount),
    })
  )

  if (mapped === "PAID") {
    await syncAsaasSubscription(invoice.clinicSubscriptionId).catch((err) => {
      console.warn("[SaaS Billing] syncAsaasSubscription after PAID failed:", err)
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

export async function syncPendingStaticPixInvoice(invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findUnique({ where: { id: invoiceId } })
  if (!invoice || invoice.status === "PAID" || invoice.status === "CANCELLED") return invoice
  if (!isAsaasConfigured()) return invoice

  const qrId = asaas.parsePixQrTrackingId(invoice.asaasPaymentId)
  if (qrId) {
    const listed = await asaas.listPayments({ pixQrCodeId: qrId, limit: 10 })
    const paid = listed.data?.find((row) => row.status === "RECEIVED" || row.status === "CONFIRMED")
    if (paid) {
      await handleSubscriptionPaymentWebhook(paid.id, paid.status, paid)
    }
    return prisma.subscriptionInvoice.findUnique({ where: { id: invoiceId } })
  }

  if (asaas.isCobvPixPayload(invoice.pixCopyPaste) || !asaas.isValidPixPayload(invoice.pixCopyPaste)) {
    try {
      return await refreshInvoicePix(invoice.id, invoice.clinicId)
    } catch {
      return invoice
    }
  }
  return invoice
}

export async function listClinicInvoices(clinicId: string) {
  const rows = await prisma.subscriptionInvoice.findMany({
    where: { clinicId },
    orderBy: { dueDate: "desc" },
    take: 24,
    include: { subscription: { include: { plan: true } } },
  })
  for (const row of rows) {
    if (
      (row.status === "PENDING" || row.status === "OVERDUE") &&
      row.billingType === "PIX" &&
      (asaas.isCobvPixPayload(row.pixCopyPaste) || !asaas.isValidPixPayload(row.pixCopyPaste))
    ) {
      try {
        const refreshed = await refreshInvoicePix(row.id, clinicId)
        row.pixQrCode = refreshed.pixQrCode
        row.pixCopyPaste = refreshed.pixCopyPaste
        row.asaasPaymentId = refreshed.asaasPaymentId
      } catch (err) {
        console.warn("[SaaS Billing] nao converteu Pix cobv para estatico:", err)
      }
    }
  }
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
  if (!invoice || !isAsaasConfigured()) throw new Error("NOT_AVAILABLE")
  if (invoice.status === "PAID" || invoice.status === "CANCELLED") throw new Error("NOT_AVAILABLE")
  const paymentRef = invoice.reference ?? `subscription-invoice:${invoice.clinicSubscriptionId}:${Date.now()}`
  const staticQr = await asaas.createTrackedStaticPix({
    value: moneyFromUnknown(invoice.amount),
    description: "ClinMax assinatura",
    externalReference: paymentRef,
  })
  if (invoice.asaasPaymentId && invoice.asaasPaymentId !== staticQr.trackingId) {
    await releaseAsaasCharge(invoice.asaasPaymentId)
  }
  return prisma.subscriptionInvoice.update({
    where: { id: invoiceId },
    data: {
      asaasPaymentId: staticQr.trackingId,
      pixQrCode: staticQr.encodedImage || null,
      pixCopyPaste: staticQr.payload,
    },
  })
}
