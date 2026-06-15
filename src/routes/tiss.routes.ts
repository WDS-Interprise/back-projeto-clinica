import type { FastifyInstance } from "fastify"
import { listGuides, createGuide, updateStatus } from "@/controllers/tiss.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("finance:view" as Permission))

  app.get("/guides", listGuides)
  app.post("/guides", { preHandler: app.requirePermission("finance:manage" as Permission) }, createGuide)
  app.patch("/guides/:id/status", { preHandler: app.requirePermission("finance:manage" as Permission) }, updateStatus)
}
