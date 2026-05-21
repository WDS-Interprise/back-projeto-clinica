import type { FastifyInstance } from "fastify"
import * as procedureService from "@/services/procedure.service.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/", async (_req, reply) => {
    const data = await procedureService.list()
    return reply.send(data)
  })
}
