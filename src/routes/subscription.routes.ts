import type { FastifyInstance } from "fastify"
import {
  getCurrentSubscription,
  getClinicSubscriptionUsage,
  listClinicSubscriptionPlans,
  listClinicInvoices,
  changeClinicPlan,
  refreshInvoicePix,
} from "@/controllers/saas-billing.controller.js"

export default async function subscriptionRoutes(app: FastifyInstance) {
  const adminPerm = [app.auth, app.requirePermission("clinics:manage")]

  app.get("/current", { preHandler: adminPerm }, getCurrentSubscription)
  app.get("/usage", { preHandler: adminPerm }, getClinicSubscriptionUsage)
  app.get("/plans", { preHandler: adminPerm }, listClinicSubscriptionPlans)
  app.get("/invoices", { preHandler: adminPerm }, listClinicInvoices)
  app.post("/change-plan", { preHandler: adminPerm }, changeClinicPlan)
  app.post("/invoices/:id/refresh-pix", { preHandler: adminPerm }, refreshInvoicePix)
}
