import type { FastifyInstance } from "fastify"
import { list, getById, create, update, remove } from "@/controllers/clinics.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/", list)
  app.get("/:id", getById)
  app.put("/:id", { preHandler: [app.requirePermission("clinics:manage" as Permission)] }, update)
}
