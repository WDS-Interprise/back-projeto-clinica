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
  createPaymentMethod,
  analysis,
} from "@/controllers/finance.controller.js"
import type { Permission } from "@/lib/permissions.js"

const view = "finance:view" as Permission
const manage = "finance:manage" as Permission
const config = "clinics:manage" as Permission

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/summary", { preHandler: app.requirePermission(view) }, summary)
  app.get("/cash-flow", { preHandler: app.requirePermission(view) }, cashFlow)
  app.get("/analysis", { preHandler: app.requirePermission(view) }, analysis)
  app.get("/transactions", { preHandler: app.requirePermission(view) }, listTransactions)
  app.post("/transactions", { preHandler: app.requirePermission(manage) }, createTransaction)
  app.patch("/transactions/:id/status", { preHandler: app.requirePermission(manage) }, updateStatus)
  app.delete("/transactions/:id", { preHandler: app.requirePermission(manage) }, removeTransaction)

  app.get("/accounts", { preHandler: app.requirePermission(view) }, listAccounts)
  app.post("/accounts", { preHandler: app.requirePermission(config) }, createAccount)
  app.get("/categories", { preHandler: app.requirePermission(view) }, listCategories)
  app.post("/categories", { preHandler: app.requirePermission(config) }, createCategory)
  app.get("/cost-centers", { preHandler: app.requirePermission(view) }, listCostCenters)
  app.post("/cost-centers", { preHandler: app.requirePermission(config) }, createCostCenter)
  app.get("/payment-methods", { preHandler: app.requirePermission(view) }, listPaymentMethods)
  app.post("/payment-methods", { preHandler: app.requirePermission(config) }, createPaymentMethod)

  app.get("/settings", { preHandler: app.requirePermission(config) }, financeSettingsGet)
  app.put("/settings", { preHandler: app.requirePermission(config) }, financeSettingsPut)
}
