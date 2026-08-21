import type { FastifyInstance } from "fastify"
import { asaasWebhook } from "@/controllers/clinmax-pay.controller.js"

export default async function (app: FastifyInstance) {
  app.post("/asaas", asaasWebhook)
}
