import type { FastifyRequest, FastifyReply } from "fastify"
import * as cid10Service from "@/services/cid10.service.js"
import * as cid11Service from "@/services/cid11.service.js"
import * as cidInssService from "@/services/cid-inss.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import { writeAuditLog } from "@/lib/audit-log.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as { userId: string; clinicId?: string }
  return buildAuthContext(payload.userId, payload.clinicId)
}

function parsePagination(query: Record<string, string | undefined>) {
  return {
    search: query.search,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,
  }
}

export async function searchCid10(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as Record<string, string | undefined>
    const data = await cid10Service.searchCid10({
      ...parsePagination(q),
      capitulo: q.capitulo,
      grupo: q.grupo,
      tipo: q.tipo,
    })
    if (q.search?.trim()) {
      await writeAuditLog({
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        module: "CID10",
        action: "BUSCAR",
        description: `Consulta CID-10: "${q.search}"`,
        metadata: { count: data.data.length, page: data.page },
      })
    }
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar CID-10" })
  }
}

export async function getCid10Capitulos(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send(await cid10Service.listCid10Capitulos())
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar capítulos CID-10" })
  }
}

export async function getCid10Grupos(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as { capitulo?: string }
    return reply.send(await cid10Service.listCid10Grupos(q.capitulo))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar grupos CID-10" })
  }
}

export async function getCid10ByCodigo(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { codigo } = req.params as { codigo: string }
    const item = await cid10Service.getCid10ByCodigo(codigo)
    if (!item) return reply.status(404).send({ error: "Código CID-10 não encontrado" })
    return reply.send(item)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar código CID-10" })
  }
}

export async function searchCid11(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as Record<string, string | undefined>
    const data = await cid11Service.searchCid11({
      ...parsePagination(q),
      capitulo: q.capitulo,
      bloco: q.bloco,
      tipo: q.tipo,
    })
    if (q.search?.trim()) {
      await writeAuditLog({
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        module: "CID11",
        action: "BUSCAR",
        description: `Consulta CID-11: "${q.search}"`,
        metadata: { count: data.data.length, page: data.page },
      })
    }
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar CID-11" })
  }
}

export async function getCid11Capitulos(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send(await cid11Service.listCid11Capitulos())
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar capítulos CID-11" })
  }
}

export async function getCid11Blocos(req: FastifyRequest, reply: FastifyReply) {
  try {
    const q = req.query as { capitulo?: string }
    return reply.send(await cid11Service.listCid11Blocos(q.capitulo))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar blocos CID-11" })
  }
}

export async function getCid11ByCodigo(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { codigo } = req.params as { codigo: string }
    const item = await cid11Service.getCid11ByCodigo(codigo)
    if (!item) return reply.status(404).send({ error: "Código CID-11 não encontrado" })
    return reply.send(item)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar código CID-11" })
  }
}

export async function getCidInss(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { codigo } = req.params as { codigo: string }
    const item = await cidInssService.getInssByCodigo(codigo)
    if (!item) return reply.status(404).send({ error: "Informações INSS não encontradas para este CID" })
    return reply.send(item)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar informações INSS" })
  }
}
