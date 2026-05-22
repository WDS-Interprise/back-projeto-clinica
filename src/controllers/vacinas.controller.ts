import type { FastifyRequest, FastifyReply } from "fastify"
import * as vacinasService from "@/services/vacinas.service.js"

export async function searchVacinas(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = (req.query as { q?: string }).q ?? ""
    const data = await vacinasService.searchVacinas(q)
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar vacinas" })
  }
}
