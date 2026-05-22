import type { FastifyInstance } from "fastify"
import { searchExames, getExameByCode } from "@/controllers/exames.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/search", searchExames)
  app.get("/:code", getExameByCode)
}
