import type { FastifyInstance } from "fastify"
import {
  searchBulas,
  getBula,
  listCid10Chapters,
  searchCid10,
  getCid10Code,
  listContacts,
  listLogs,
} from "@/controllers/outros.controller.js"
import type { Permission } from "@/lib/permissions.js"

const clinical = "clinical_tools:view" as Permission

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/bulas/search", { preHandler: app.requirePermission(clinical) }, searchBulas)
  app.get("/bulas/:id", { preHandler: app.requirePermission(clinical) }, getBula)
  app.get("/cid10/chapters", { preHandler: app.requirePermission(clinical, "records:write") }, listCid10Chapters)
  app.get("/cid10/search", { preHandler: app.requirePermission(clinical, "records:write") }, searchCid10)
  app.get("/cid10/code/:code", { preHandler: app.requirePermission(clinical, "records:write") }, getCid10Code)
  app.get("/contacts", { preHandler: app.requirePermission("patients:view" as Permission) }, listContacts)
  app.get("/logs", { preHandler: app.requirePermission("users:manage", "audit:view") }, listLogs)
}
