import type { FastifyInstance } from "fastify"
import {
  searchMedicamentos,
  getMedicamentoProduto,
} from "@/controllers/medicamentos.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/search", searchMedicamentos)
  app.get("/products/:id", getMedicamentoProduto)
}
