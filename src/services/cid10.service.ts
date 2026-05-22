import prisma from "@/lib/prisma.js"
import type { PaginatedResult } from "@/lib/cid-types.js"

export type Cid10SearchParams = {
  search?: string
  capitulo?: string
  grupo?: string
  tipo?: string
  page?: number
  limit?: number
}

function buildWhere(params: Cid10SearchParams) {
  const and: Record<string, unknown>[] = []
  const { search, capitulo, grupo, tipo } = params

  if (capitulo) and.push({ capitulo })
  if (grupo) and.push({ grupo })
  if (tipo) and.push({ tipo })

  const term = search?.trim()
  if (term) {
    const upper = term.toUpperCase()
    and.push({
      OR: [
        { codigo: upper },
        { codigo: { contains: upper } },
        { descricao: { contains: term } },
        { searchText: { contains: term.toLowerCase() } },
      ],
    })
  }

  return and.length ? { AND: and } : {}
}

export async function searchCid10(params: Cid10SearchParams): Promise<PaginatedResult<unknown>> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const skip = (page - 1) * limit
  const where = buildWhere(params)

  const [data, total] = await Promise.all([
    prisma.cid10.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ codigo: "asc" }],
    }),
    prisma.cid10.count({ where }),
  ])

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function getCid10ByCodigo(codigo: string) {
  return prisma.cid10.findUnique({
    where: { codigo: codigo.toUpperCase() },
  })
}

export async function listCid10Capitulos() {
  const rows = await prisma.cid10.findMany({
    distinct: ["capitulo"],
    select: { capitulo: true, capituloDesc: true },
    orderBy: { capitulo: "asc" },
  })
  return rows.map((r) => ({
    codigo: r.capitulo,
    descricao: r.capituloDesc,
  }))
}

export async function listCid10Grupos(capitulo?: string) {
  const rows = await prisma.cid10.findMany({
    where: capitulo ? { capitulo } : undefined,
    distinct: ["grupo"],
    select: { grupo: true, grupoDesc: true, capitulo: true },
    orderBy: { grupo: "asc" },
  })
  return rows.map((r) => ({
    codigo: r.grupo,
    descricao: r.grupoDesc,
    capitulo: r.capitulo,
  }))
}
