import type { FastifyInstance } from "fastify"
import { list, create, update, remove } from "@/controllers/agenda-notes.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("agenda_notes:manage" as Permission))

  app.get("/", list)
  app.post("/", create)
  app.put("/:id", update)
  app.delete("/:id", remove)
}
