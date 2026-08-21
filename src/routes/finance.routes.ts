import type { FastifyInstance } from "fastify"
import {
  summary,
  listTransactions,
  createTransaction,
  updateStatus,
  removeTransaction,
  listAccounts,
  listCategories,
  listCostCenters,
  listPaymentMethods,
  cashFlow,
  financeSettingsGet,
  financeSettingsPut,
  createAccount,
  createCategory,
  createCostCenter,
  updateCostCenter,
  removeCostCenter,
  createPaymentMethod,
  removePaymentMethod,
  analysis,
} from "@/controllers/finance.controller.js"
import {
  paySettingsGet,
  paySettingsPut,
  payEnabledPatch,
} from "@/controllers/clinmax-pay.controller.js"
import type { Permission } from "@/lib/permissions.js"

const view = "finance:view" as Permission
const manage = "finance:manage" as Permission
const config = "clinics:manage" as Permission

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  const financeFeature = { preHandler: [app.requirePlanFeature("FINANCE")] }
  const payFeature = { preHandler: [app.requirePlanFeature("CLINMAX_PAY")] }

  app.get("/summary", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, summary)
  app.get("/cash-flow", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, cashFlow)
  app.get("/analysis", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, analysis)
  app.get("/transactions", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, listTransactions)
  app.post("/transactions", { preHandler: [app.requirePermission(manage), ...financeFeature.preHandler] }, createTransaction)
  app.patch("/transactions/:id/status", { preHandler: [app.requirePermission(manage), ...financeFeature.preHandler] }, updateStatus)
  app.delete("/transactions/:id", { preHandler: [app.requirePermission(manage), ...financeFeature.preHandler] }, removeTransaction)

  app.get("/accounts", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, listAccounts)
  app.post("/accounts", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, createAccount)
  app.get("/categories", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, listCategories)
  app.post("/categories", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, createCategory)
  app.get("/cost-centers", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, listCostCenters)
  app.post("/cost-centers", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, createCostCenter)
  app.patch("/cost-centers/:id", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, updateCostCenter)
  app.delete("/cost-centers/:id", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, removeCostCenter)
  app.get("/payment-methods", { preHandler: [app.requirePermission(view), ...financeFeature.preHandler] }, listPaymentMethods)
  app.post("/payment-methods", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, createPaymentMethod)
  app.delete("/payment-methods/:id", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, removePaymentMethod)

  app.get("/settings", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, financeSettingsGet)
  app.put("/settings", { preHandler: [app.requirePermission(config), ...financeFeature.preHandler] }, financeSettingsPut)

  app.get("/pay/settings", { preHandler: [app.requirePermission(config), ...payFeature.preHandler] }, paySettingsGet)
  app.put("/pay/settings", { preHandler: [app.requirePermission(config), ...payFeature.preHandler] }, paySettingsPut)
  app.patch("/pay/enabled", { preHandler: [app.requirePermission(config), ...payFeature.preHandler] }, payEnabledPatch)
}
