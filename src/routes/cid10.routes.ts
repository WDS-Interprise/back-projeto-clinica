import type { FastifyInstance } from "fastify"
import {
  searchCid10,
  getCid10Capitulos,
  getCid10Grupos,
  getCid10ByCodigo,
} from "@/controllers/cid.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/capitulos", getCid10Capitulos)
  app.get("/grupos", getCid10Grupos)
  app.get("/", searchCid10)
  app.get("/:codigo", getCid10ByCodigo)
}
