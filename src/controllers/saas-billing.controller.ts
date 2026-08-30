import type { FastifyRequest, FastifyReply } from "fastify"
import type { JwtPayload } from "@/types/index.js"
import * as planService from "@/services/plan.service.js"
import * as subscriptionService from "@/services/subscription.service.js"
import * as platformSettings from "@/services/platform-settings.service.js"
import * as billing from "@/services/subscription-billing.service.js"
import type { PlanFeature } from "@/lib/plan-features.js"
import type { BillingCycle } from "@prisma/client"

function ownerId(req: FastifyRequest) {
  return (req.user as JwtPayload).userId
}

export async function listPlans(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send(await planService.listPlans(true))
}

export async function getPlan(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const plan = await planService.getPlanById(id)
  if (!plan) return reply.status(404).send({ error: "Plano não encontrado" })
  return reply.send(plan)
}

export async function createPlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const plan = await planService.createPlan(req.body as Parameters<typeof planService.createPlan>[0], ownerId(req))
    return reply.status(201).send(plan)
  } catch (err) {
    req.log.error(err)
    return reply.status(400).send({ error: "Não foi possível criar o plano" })
  }
}

export async function updatePlan(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  try {
    return reply.send(await planService.updatePlan(id, req.body as Parameters<typeof planService.updatePlan>[1], ownerId(req)))
  } catch {
    return reply.status(404).send({ error: "Plano não encontrado" })
  }
}

export async function duplicatePlan(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  try {
    return reply.status(201).send(await planService.duplicatePlan(id, ownerId(req)))
  } catch {
    return reply.status(404).send({ error: "Plano não encontrado" })
  }
}

export async function listSubscriptions(req: FastifyRequest, reply: FastifyReply) {
  const q = req.query as { status?: string; search?: string }
  return reply.send(await subscriptionService.listSubscriptions(q))
}

export async function getSubscription(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const sub = await subscriptionService.getSubscriptionById(id)
  if (!sub) return reply.status(404).send({ error: "Assinatura não encontrada" })
  return reply.send(sub)
}

export async function changeSubscriptionPlan(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const body = req.body as { planId: string; billingCycle?: BillingCycle }
  try {
    return reply.send(
      await subscriptionService.changePlan(id, body.planId, ownerId(req), {
        billingCycle: body.billingCycle,
        allowNonSequential: true,
      })
    )
  } catch {
    return reply.status(400).send({ error: "Não foi possível alterar o plano" })
  }
}

export async function extendTrial(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const { days } = req.body as { days: number }
  try {
    return reply.send(await subscriptionService.extendTrial(id, days, ownerId(req)))
  } catch {
    return reply.status(400).send({ error: "Não foi possível estender o trial" })
  }
}

export async function grantCourtesy(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const { until } = req.body as { until: string }
  try {
    return reply.send(await subscriptionService.grantCourtesy(id, new Date(until), ownerId(req)))
  } catch {
    return reply.status(400).send({ error: "Não foi possível conceder cortesia" })
  }
}

export async function cancelSubscription(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const { atPeriodEnd } = (req.body as { atPeriodEnd?: boolean }) ?? {}
  try {
    return reply.send(await subscriptionService.cancelSubscription(id, ownerId(req), atPeriodEnd ?? true))
  } catch {
    return reply.status(400).send({ error: "Não foi possível cancelar" })
  }
}

export async function reactivateSubscription(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  try {
    return reply.send(await subscriptionService.reactivateSubscription(id, ownerId(req)))
  } catch {
    return reply.status(400).send({ error: "Não foi possível reativar" })
  }
}

export async function suspendSubscription(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  try {
    return reply.send(await subscriptionService.suspendSubscription(id, ownerId(req)))
  } catch {
    return reply.status(400).send({ error: "Não foi possível suspender" })
  }
}

export async function listBilling(req: FastifyRequest, reply: FastifyReply) {
  const q = req.query as { status?: string; search?: string }
  const [invoices, summary] = await Promise.all([
    subscriptionService.listInvoices(q),
    subscriptionService.getBillingSummary(),
  ])
  return reply.send({ invoices, summary })
}

export async function getClinicDetail(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const detail = await subscriptionService.getClinicDetail(id)
  if (!detail) return reply.status(404).send({ error: "Clínica não encontrada" })
  return reply.send(detail)
}

export async function getClinicUsage(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const detail = await subscriptionService.getClinicDetail(id)
  if (!detail) return reply.status(404).send({ error: "Clínica não encontrada" })
  return reply.send({ usage: detail.usage, subscription: detail.subscription })
}

export async function getPlatformSettings(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send(await platformSettings.getPlatformSettings())
}

export async function updatePlatformSettings(req: FastifyRequest, reply: FastifyReply) {
  return reply.send(await platformSettings.updatePlatformSettings(req.body as Parameters<typeof platformSettings.updatePlatformSettings>[0], ownerId(req)))
}

export async function createSubscriptionInvoice(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string }
  try {
    const invoice = await billing.createManualInvoice(id)
    return reply.status(201).send(invoice)
  } catch {
    return reply.status(400).send({ error: "Não foi possível gerar cobrança" })
  }
}

export async function getCurrentSubscription(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  const sub = await subscriptionService.getSubscriptionByClinicId(payload.clinicId)
  if (!sub) return reply.status(404).send({ error: "Assinatura não encontrada" })
  return reply.send(sub)
}

export async function getClinicSubscriptionUsage(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  const detail = await subscriptionService.getClinicDetail(payload.clinicId)
  if (!detail) return reply.status(404).send({ error: "Clínica não encontrada" })
  const entitlements = await (await import("@/lib/plan-entitlements.js")).getClinicEntitlements(payload.clinicId)
  return reply.send({
    usage: detail.usage,
    subscription: detail.subscription,
    features: entitlements.features,
    isActive: entitlements.isActive,
  })
}

export async function listClinicSubscriptionPlans(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send(await planService.listPublicPlans())
}

export async function listClinicInvoices(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  return reply.send(await billing.listClinicInvoices(payload.clinicId))
}

export async function changeClinicPlan(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  const body = req.body as {
    planId: string
    billingCycle?: BillingCycle
    paymentMethod?: "PIX" | "CREDIT_CARD"
    creditCard?: {
      holderName: string
      number: string
      expiryMonth: string
      expiryYear: string
      ccv: string
    }
    creditCardHolderInfo?: {
      name: string
      email: string
      cpfCnpj: string
      postalCode: string
      addressNumber: string
      phone: string
    }
  }
  try {
    const forwarded = req.headers["x-forwarded-for"]
    const remoteIp =
      (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) || req.ip || "127.0.0.1"
    const sub = await subscriptionService.requestPlanChangeByClinic(
      payload.clinicId,
      body.planId,
      body.billingCycle ?? "MONTHLY",
      {
        paymentMethod: body.paymentMethod ?? "PIX",
        remoteIp,
        creditCard: body.creditCard,
        creditCardHolderInfo: body.creditCardHolderInfo,
      }
    )
    return reply.send(sub)
  } catch (err) {
    const raw = err instanceof Error ? err.message : ""
    const sequential = raw.startsWith("PLAN_UPGRADE_NOT_SEQUENTIAL")
    const nextSlug = sequential && raw.includes(":") ? raw.split(":")[1] : ""
    const nextName =
      nextSlug === "profissional" ? "Profissional" : nextSlug === "premium" ? "Premium" : nextSlug === "essencial" ? "Essencial" : ""
    const message =
      err instanceof billing.BillingRequirementError
        ? err.message
        : sequential
          ? nextName
            ? `Só é possível subir um plano por vez. Assine o ${nextName} primeiro.`
            : "Só é possível subir um plano por vez."
        : raw.toLowerCase().includes("cpf")
          ? "Informe o CNPJ da clínica (ou o CPF do responsável) nas configurações para gerar o pagamento da assinatura."
          : "Não foi possível alterar o plano"
    req.log.error(err)
    return reply.status(400).send({ error: message })
  }
}

export async function cancelClinicUpgrade(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  try {
    return reply.send(await subscriptionService.cancelPendingUpgradeByClinic(payload.clinicId, payload.userId))
  } catch {
    return reply.status(400).send({ error: "Não foi possível cancelar a cobrança de upgrade" })
  }
}

export async function refreshInvoicePix(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.user as JwtPayload
  if (!payload.clinicId) return reply.status(403).send({ error: "Usuário sem clínica selecionada" })
  const { id } = req.params as { id: string }
  try {
    return reply.send(await billing.refreshInvoicePix(id, payload.clinicId))
  } catch {
    return reply.status(400).send({ error: "Pix indisponível para esta cobrança" })
  }
}
