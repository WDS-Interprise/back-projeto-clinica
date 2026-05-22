import * as tussClient from "@/lib/tuss.client.js"
import type { TussSearchResponse, TussTerm } from "@/types/tuss.js"

const MIN_QUERY_LEN = 2
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 20

type CacheEntry = { expiresAt: number; data: TussSearchResponse }
const searchCache = new Map<string, CacheEntry>()

const FALLBACK_TERMS: TussTerm[] = [
  {
    tussCode: "30602262",
    name: "Grande dorsal (latissimus dorsi) - transplantes musculares com microanastomoses vasculares",
  },
  {
    tussCode: "40804054",
    name: "RX - Coluna dorso-lombar para escoliose",
  },
  {
    tussCode: "30602270",
    name: "Grande dorsal (latissimus dorsi) - transplantes músculo-cutâneos com microanastomoses vasculares",
  },
  { tussCode: "30602199", name: "Dorsal do pé - transplantes cutâneos" },
  { tussCode: "40804038", name: "RX - Coluna dorsal - 4 incidências" },
  { tussCode: "40304361", name: "Hemograma completo" },
  { tussCode: "40316572", name: "Glicemia em jejum" },
  { tussCode: "40302547", name: "Creatinina" },
  { tussCode: "40311210", name: "TSH - Hormônio tireoestimulante" },
  { tussCode: "10101012", name: "Consulta em consultório (no horário normal ou preestabelecido)" },
]

function normalizeQuery(q: string) {
  return q.trim().toLowerCase()
}

function mapItem(item: tussClient.TussApiItem): TussTerm {
  return {
    tussCode: item.tuss.replace(/\D/g, ""),
    name: item.name.trim(),
  }
}

function searchFallback(query: string, limit: number): TussSearchResponse {
  const q = normalizeQuery(query)
  const digits = query.replace(/\D/g, "")
  const items = FALLBACK_TERMS.filter((term) => {
    if (digits && term.tussCode.startsWith(digits)) return true
    return term.name.toLowerCase().includes(q)
  }).slice(0, limit)

  return {
    query,
    total: items.length,
    items,
    source: "fallback",
  }
}

async function fetchFromApi(query: string, limit: number): Promise<TussSearchResponse> {
  const digitsOnly = query.replace(/\D/g, "")

  const attempts: Array<() => Promise<tussClient.TussApiListResponse>> = [
    () => tussClient.autocompleteTuss(query, limit),
    () => tussClient.searchTuss({ q: query, match: "prefix", limit }),
    () =>
      digitsOnly.length >= 2
        ? tussClient.listTuss({ tuss: digitsOnly, limit })
        : tussClient.listTuss({ name: query, limit }),
  ]

  let response: tussClient.TussApiListResponse | null = null
  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result?.items?.length) {
        response = result
        break
      }
      if (!response) response = result
    } catch {
      // tenta próximo endpoint
    }
  }

  const items = (response?.items ?? []).map(mapItem).filter((i) => i.name && i.tussCode)

  return {
    query,
    total: response?.total ?? items.length,
    items,
    source: "brasilapi",
  }
}

export async function searchExames(query: string): Promise<TussSearchResponse> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LEN) {
    return { query: trimmed, total: 0, items: [], source: "brasilapi" }
  }

  const cacheKey = `${normalizeQuery(trimmed)}:${DEFAULT_LIMIT}`
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  try {
    const data = await fetchFromApi(trimmed, DEFAULT_LIMIT)
    if (data.items.length === 0) {
      const fallback = searchFallback(trimmed, DEFAULT_LIMIT)
      searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: fallback })
      return fallback
    }
    searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data })
    return data
  } catch {
    const data = searchFallback(trimmed, DEFAULT_LIMIT)
    searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data })
    return data
  }
}

export async function getExameByTussCode(code: string): Promise<TussTerm | null> {
  const digits = code.replace(/\D/g, "")
  if (!digits) return null

  try {
    const item = await tussClient.getTussByCode(digits)
    return mapItem(item)
  } catch {
    return FALLBACK_TERMS.find((t) => t.tussCode === digits) ?? null
  }
}
