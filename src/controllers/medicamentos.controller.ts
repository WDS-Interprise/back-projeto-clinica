import type { FastifyRequest, FastifyReply } from "fastify"
import * as medicamentosService from "@/services/medicamentos.service.js"

export async function searchMedicamentos(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = (req.query as { q?: string }).q ?? ""
    const data = await medicamentosService.searchMedicamentos(q)
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar medicamentos" })
  }
}

export async function getMedicamentoProduto(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const product = await medicamentosService.getMedicamentoProduto(id)
    if (!product) return reply.status(404).send({ error: "Medicamento não encontrado" })
    return reply.send(product)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar medicamento" })
  }
}
