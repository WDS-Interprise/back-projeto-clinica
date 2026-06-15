import type { FastifyInstance } from "fastify"
import { attendance, noShows, birthdays, cid, repasse } from "@/controllers/reports.controller.js"
import type { Permission } from "@/lib/permissions.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)
  app.addHook("preHandler", app.requirePermission("reports:view" as Permission))

  app.get("/attendance", attendance)
  app.get("/no-shows", noShows)
  app.get("/birthdays", birthdays)
  app.get("/cid", cid)
  app.get("/repasse", repasse)
}
