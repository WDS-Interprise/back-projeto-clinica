import type { FastifyRequest, FastifyReply } from "fastify"
import * as bulasService from "@/services/bulas.service.js"
import { BulaFetchError } from "@/lib/bula-types.js"
import * as cid10Service from "@/services/cid10.service.js"
import * as contactsService from "@/services/contacts.service.js"
import * as logsService from "@/services/logs.service.js"
import { buildAuthContext } from "@/lib/auth-context.js"
import { writeAuditLog } from "@/lib/audit-log.js"
import { hasPermission } from "@/lib/permissions.js"

async function ctxFromReq(req: FastifyRequest) {
  const payload = req.user as { userId: string; clinicId?: string }
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function searchBulas(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const query = req.query as { q?: string; page?: string; limit?: string }
    const q = query.q ?? ""
    const page = query.page ? Number(query.page) : 1
    const limit = query.limit ? Number(query.limit) : 20
    const data = await bulasService.searchMedicinesPaginated({ q, page, limit })
    await writeAuditLog({
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      module: "Bulas",
      action: "BUSCAR",
      description: `Consulta de bulas: "${q || "(vazio)"}" (pág. ${data.page})`,
      metadata: {
        source: data.source,
        count: data.items.length,
        page: data.page,
        total: data.total,
      },
    })
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar bulas" })
  }
}

export async function getBula(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string }
    const item = await bulasService.getBulaDetail(id)
    return reply.send(item)
  } catch (error) {
    if (error instanceof BulaFetchError) {
      if (error.code === "NOT_FOUND") {
        return reply.status(404).send({ error: error.message })
      }
      return reply.status(502).send({ error: error.message })
    }
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar medicamento" })
  }
}

export async function listCid10Chapters(req: FastifyRequest, reply: FastifyReply) {
  try {
    const capitulos = await cid10Service.listCid10Capitulos()
    return reply.send(
      capitulos.map((c, i) => ({
        id: c.codigo,
        romanNumber: c.codigo,
        name: c.descricao,
        codeRange: c.codigo,
        order: i + 1,
      }))
    )
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar capitulos CID-10" })
  }
}

export async function searchCid10(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = (req.query as { q?: string }).q ?? ""
    const result = await cid10Service.searchCid10({ search: q, limit: 50 })
    if (q.trim()) {
      await writeAuditLog({
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        module: "CID10",
        action: "BUSCAR",
        description: `Consulta CID-10: "${q}"`,
        metadata: { count: result.data.length },
      })
    }
    const data = result.data.map((item: any) => ({
      id: item.id,
      code: item.codigo,
      description: item.descricao,
      chapter: { name: item.capituloDesc, romanNumber: item.capitulo },
    }))
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar CID-10" })
  }
}

export async function getCid10Code(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = req.params as { code: string }
    const item = await cid10Service.getCid10ByCodigo(code)
    if (!item) return reply.status(404).send({ error: "Codigo CID-10 nao encontrado" })
    return reply.send({
      code: item.codigo,
      description: item.descricao,
      chapter: { name: item.capituloDesc, romanNumber: item.capitulo },
      grupo: item.grupo,
      grupoDesc: item.grupoDesc,
      tipo: item.tipo,
    })
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao buscar codigo CID-10" })
  }
}

export async function listContacts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    const q = req.query as { search?: string; type?: string }
    return reply.send(await contactsService.listContacts(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar contatos" })
  }
}

export async function listLogs(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromReq(req)
    if (!hasPermission(ctx.role, "users:manage")) {
      return reply.status(403).send({ error: "Acesso negado aos logs do sistema" })
    }
    const q = req.query as { search?: string; module?: string; page?: string }
    const data = await logsService.listLogs(ctx, {
      search: q.search,
      module: q.module,
      page: q.page ? Number(q.page) : undefined,
    })
    return reply.send(data)
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro ao listar logs" })
  }
}
