import prisma from "@/lib/prisma.js"
import type { BulaDetailPayload, BulaSummary } from "@/lib/bula-types.js"

const CACHE_TTL_MS =
  Number(process.env.BULA_CACHE_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000

export function isCacheFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < CACHE_TTL_MS
}

export async function getBulaFromCache(
  externalId: string
): Promise<BulaDetailPayload | null> {
  const row = await prisma.bulaCache.findUnique({ where: { externalId } })
  if (!row || !isCacheFresh(row.fetchedAt)) return null
  try {
    return JSON.parse(row.payloadJson) as BulaDetailPayload
  } catch {
    return null
  }
}

export async function searchBulaCacheByQuery(
  query: string,
  limit = 20
): Promise<BulaSummary[]> {
  const q = query.trim()
  if (!q) return []

  const rows = await prisma.bulaCache.findMany({
    where: {
      OR: [
        { substanceName: { contains: q } },
        { externalId: { contains: q } },
        { payloadJson: { contains: q } },
      ],
    },
    orderBy: { fetchedAt: "desc" },
    take: limit * 3,
  })

  const fresh = rows.filter((row) => isCacheFresh(row.fetchedAt))
  const seen = new Set<string>()

  return fresh
    .map((row) => {
      try {
        const payload = JSON.parse(row.payloadJson) as BulaDetailPayload
        if (seen.has(row.externalId)) return null
        seen.add(row.externalId)
        return {
          id: row.externalId,
          name: payload.nome,
          substanceName: row.substanceName ?? payload.nome,
        } satisfies BulaSummary
      } catch {
        return null
      }
    })
    .filter((x) => x !== null)
    .slice(0, limit)
}

export async function saveBulaToCache(params: {
  externalId: string
  substanceKey: string
  substanceName?: string
  source: string
  payload: BulaDetailPayload
}): Promise<void> {
  const payloadJson = JSON.stringify(params.payload)
  await prisma.bulaCache.upsert({
    where: { externalId: params.externalId },
    create: {
      externalId: params.externalId,
      substanceKey: params.substanceKey,
      substanceName: params.substanceName,
      source: params.source,
      payloadJson,
    },
    update: {
      substanceKey: params.substanceKey,
      substanceName: params.substanceName,
      source: params.source,
      payloadJson,
      fetchedAt: new Date(),
    },
  })
}
