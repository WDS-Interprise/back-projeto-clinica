import type { FastifyInstance } from "fastify"
import { getCidInss } from "@/controllers/cid.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get(
    "/inss/:codigo",
    { preHandler: app.requirePermission("clinical_tools:view" as Permission, "records:write" as Permission) },
    getCidInss
  )
}
