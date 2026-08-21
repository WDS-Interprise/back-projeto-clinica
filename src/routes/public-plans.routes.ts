import type { FastifyInstance } from "fastify"
import * as planService from "@/services/plan.service.js"

export default async function publicPlansRoutes(app: FastifyInstance) {
  app.get("/plans", async (_req, reply) => {
    return reply.send(await planService.listPublicCatalog())
  })
}
