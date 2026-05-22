import type { FastifyRequest, FastifyReply } from "fastify"
import * as examesService from "@/services/exames.service.js"

export async function searchExames(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = (req.query as { q?: string }).q ?? ""
    const data = await examesService.searchExames(q)
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar exames" })
  }
}

export async function getExameByCode(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = req.params as { code: string }
    const item = await examesService.getExameByTussCode(code)
    if (!item) return reply.status(404).send({ error: "Exame TUSS não encontrado" })
    return reply.send(item)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar exame" })
  }
}
