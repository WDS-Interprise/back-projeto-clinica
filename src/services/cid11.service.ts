import prisma from "@/lib/prisma.js"
import type { PaginatedResult } from "@/lib/cid-types.js"

export type Cid11SearchParams = {
  search?: string
  capitulo?: string
  bloco?: string
  tipo?: string
  page?: number
  limit?: number
}

function buildWhere(params: Cid11SearchParams) {
  const and: Record<string, unknown>[] = []
  const { search, capitulo, bloco, tipo } = params

  if (capitulo) and.push({ capitulo })
  if (bloco) and.push({ bloco })
  if (tipo) and.push({ tipo })

  const term = search?.trim()
  if (term) {
    const upper = term.toUpperCase()
    and.push({
      OR: [
        { codigo: upper },
        { codigo: { contains: upper } },
        { descricao: { contains: term } },
        { cid10Equivalente: upper },
        { searchText: { contains: term.toLowerCase() } },
      ],
    })
  }

  return and.length ? { AND: and } : {}
}

export async function searchCid11(params: Cid11SearchParams): Promise<PaginatedResult<unknown>> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const skip = (page - 1) * limit
  const where = buildWhere(params)

  const [data, total] = await Promise.all([
    prisma.cid11.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ codigo: "asc" }],
    }),
    prisma.cid11.count({ where }),
  ])

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function getCid11ByCodigo(codigo: string) {
  return prisma.cid11.findUnique({
    where: { codigo: codigo.toUpperCase() },
  })
}

export async function listCid11Capitulos() {
  const rows = await prisma.cid11.findMany({
    distinct: ["capitulo"],
    select: { capitulo: true, capituloDesc: true },
    orderBy: { capitulo: "asc" },
  })
  return rows.map((r) => ({
    codigo: r.capitulo,
    descricao: r.capituloDesc,
  }))
}

export async function listCid11Blocos(capitulo?: string) {
  const rows = await prisma.cid11.findMany({
    where: capitulo ? { capitulo } : undefined,
    distinct: ["bloco"],
    select: { bloco: true, blocoDesc: true, capitulo: true },
    orderBy: { bloco: "asc" },
  })
  return rows.map((r) => ({
    codigo: r.bloco,
    descricao: r.blocoDesc,
    capitulo: r.capitulo,
  }))
}
