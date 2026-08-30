import type { FastifyInstance } from "fastify"
import {
  getCurrentSubscription,
  getClinicSubscriptionUsage,
  listClinicSubscriptionPlans,
  listClinicInvoices,
  changeClinicPlan,
  cancelClinicUpgrade,
  refreshInvoicePix,
} from "@/controllers/saas-billing.controller.js"

export default async function subscriptionRoutes(app: FastifyInstance) {
  const adminPerm = [app.auth, app.requirePermission("clinics:manage")]
  const memberPerm = [app.auth]

  app.get("/current", { preHandler: adminPerm }, getCurrentSubscription)
  app.get("/usage", { preHandler: memberPerm }, getClinicSubscriptionUsage)
  app.get("/plans", { preHandler: adminPerm }, listClinicSubscriptionPlans)
  app.get("/invoices", { preHandler: adminPerm }, listClinicInvoices)
  app.post("/change-plan", { preHandler: adminPerm }, changeClinicPlan)
  app.post("/cancel-upgrade", { preHandler: adminPerm }, cancelClinicUpgrade)
  app.post("/invoices/:id/refresh-pix", { preHandler: adminPerm }, refreshInvoicePix)
}
