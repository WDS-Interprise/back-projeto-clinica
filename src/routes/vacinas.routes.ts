import type { FastifyInstance } from "fastify"
import { searchVacinas } from "@/controllers/vacinas.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/search", searchVacinas)
}
