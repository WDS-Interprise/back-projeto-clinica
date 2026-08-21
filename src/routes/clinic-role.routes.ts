import type { FastifyInstance } from "fastify"
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  resetRole,
  removeRole,
} from "@/controllers/clinic-role.controller.js"

export default async function clinicRoleRoutes(app: FastifyInstance) {
  const manage = [app.auth, app.requirePermission("users:manage")]

  app.get("/roles", { preHandler: manage }, listRoles)
  app.get("/roles/:id", { preHandler: manage }, getRole)
  app.post("/roles", { preHandler: manage }, createRole)
  app.put("/roles/:id", { preHandler: manage }, updateRole)
  app.post("/roles/:id/reset", { preHandler: manage }, resetRole)
  app.delete("/roles/:id", { preHandler: manage }, removeRole)
}
