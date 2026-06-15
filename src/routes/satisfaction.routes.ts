import type { FastifyInstance } from "fastify"
import { list, summary, create, markSent, submitAnswer } from "@/controllers/satisfaction.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("reports:view" as Permission))

  app.get("/", list)
  app.get("/summary", summary)
  app.post("/", { preHandler: app.requirePermission("finance:manage" as Permission) }, create)
  app.post("/:id/send", { preHandler: app.requirePermission("finance:manage" as Permission) }, markSent)
  app.post("/:id/answer", submitAnswer)
}
