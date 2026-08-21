import type { FastifyInstance } from "fastify"
import {
  searchCid10,
  getCid10Capitulos,
  getCid10Grupos,
  getCid10ByCodigo,
} from "@/controllers/cid.controller.js"

import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  const gate = app.requirePermission("clinical_tools:view" as Permission, "records:write" as Permission)

  app.get("/capitulos", { preHandler: gate }, getCid10Capitulos)
  app.get("/grupos", { preHandler: gate }, getCid10Grupos)
  app.get("/", { preHandler: gate }, searchCid10)
  app.get("/:codigo", { preHandler: gate }, getCid10ByCodigo)
}
