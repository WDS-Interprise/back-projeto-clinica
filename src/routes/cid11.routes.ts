import type { FastifyInstance } from "fastify"
import {
  searchCid11,
  getCid11Capitulos,
  getCid11Blocos,
  getCid11ByCodigo,
} from "@/controllers/cid.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/capitulos", getCid11Capitulos)
  app.get("/blocos", getCid11Blocos)
  app.get("/", searchCid11)
  app.get("/:codigo", getCid11ByCodigo)
}
