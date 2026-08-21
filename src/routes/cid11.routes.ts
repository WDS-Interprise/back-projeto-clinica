import type { FastifyInstance } from "fastify"
import {
  searchCid11,
  getCid11Capitulos,
  getCid11Blocos,
  getCid11ByCodigo,
} from "@/controllers/cid.controller.js"

import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  const gate = app.requirePermission("clinical_tools:view" as Permission, "records:write" as Permission)

  app.get("/capitulos", { preHandler: gate }, getCid11Capitulos)
  app.get("/blocos", { preHandler: gate }, getCid11Blocos)
  app.get("/", { preHandler: gate }, searchCid11)
  app.get("/:codigo", { preHandler: gate }, getCid11ByCodigo)
}
