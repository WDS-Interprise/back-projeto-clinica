import type { FastifyInstance } from "fastify"
import { listProducts, createProduct, moveStock, listMovements } from "@/controllers/inventory.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("finance:view" as Permission))

  app.get("/products", listProducts)
  app.post("/products", { preHandler: app.requirePermission("finance:manage" as Permission) }, createProduct)
  app.post("/movements", { preHandler: app.requirePermission("finance:manage" as Permission) }, moveStock)
  app.get("/movements", listMovements)
}
