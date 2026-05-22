import type { FastifyInstance } from "fastify"
import { getCidInss } from "@/controllers/cid.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/inss/:codigo", getCidInss)
}
