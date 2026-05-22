import prisma from "@/lib/prisma.js"
import type { BulaDetailPayload } from "@/lib/bula-types.js"

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
