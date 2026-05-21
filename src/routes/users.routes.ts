import type { FastifyInstance } from "fastify"
import { list, getById, create, update, setLinkedDoctors } from "@/controllers/users.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("users:manage" as Permission))

  app.get("/", list)
  app.get("/:id", getById)
  app.post("/", create)
  app.put("/:id", update)
  app.put("/:id/linked-doctors", setLinkedDoctors)
}
