import type { FastifyInstance } from "fastify"
import {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  duplicatePlan,
  listSubscriptions,
  getSubscription,
  changeSubscriptionPlan,
  extendTrial,
  grantCourtesy,
  cancelSubscription,
  reactivateSubscription,
  suspendSubscription,
  listBilling,
  getClinicDetail,
  getClinicUsage,
  getPlatformSettings,
  updatePlatformSettings,
  createSubscriptionInvoice,
} from "@/controllers/saas-billing.controller.js"

export default async function backofficeSaasRoutes(app: FastifyInstance) {
  const ownerOnly = [app.auth, app.requirePlatformOwner]

  app.get("/plans", { preHandler: ownerOnly }, listPlans)
  app.post("/plans", { preHandler: ownerOnly }, createPlan)
  app.get("/plans/:id", { preHandler: ownerOnly }, getPlan)
  app.put("/plans/:id", { preHandler: ownerOnly }, updatePlan)
  app.post("/plans/:id/duplicate", { preHandler: ownerOnly }, duplicatePlan)

  app.get("/subscriptions", { preHandler: ownerOnly }, listSubscriptions)
  app.get("/subscriptions/:id", { preHandler: ownerOnly }, getSubscription)
  app.put("/subscriptions/:id/plan", { preHandler: ownerOnly }, changeSubscriptionPlan)
  app.post("/subscriptions/:id/extend-trial", { preHandler: ownerOnly }, extendTrial)
  app.post("/subscriptions/:id/courtesy", { preHandler: ownerOnly }, grantCourtesy)
  app.post("/subscriptions/:id/cancel", { preHandler: ownerOnly }, cancelSubscription)
  app.post("/subscriptions/:id/reactivate", { preHandler: ownerOnly }, reactivateSubscription)
  app.post("/subscriptions/:id/suspend", { preHandler: ownerOnly }, suspendSubscription)
  app.post("/subscriptions/:id/invoices", { preHandler: ownerOnly }, createSubscriptionInvoice)

  app.get("/billing", { preHandler: ownerOnly }, listBilling)

  app.get("/clinics/:id", { preHandler: ownerOnly }, getClinicDetail)
  app.get("/clinics/:id/usage", { preHandler: ownerOnly }, getClinicUsage)

  app.get("/platform-settings", { preHandler: ownerOnly }, getPlatformSettings)
  app.put("/platform-settings", { preHandler: ownerOnly }, updatePlatformSettings)
}
