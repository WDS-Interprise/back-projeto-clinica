import * as rxterms from "@/lib/rxterms.client.js"
import type { VacinaProduto, VacinaSearchResponse } from "@/types/vacina.js"

const MIN_QUERY_LEN = 2
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 20

type CacheEntry = { expiresAt: number; data: VacinaSearchResponse }
const searchCache = new Map<string, CacheEntry>()

const FALLBACK_VACCINES: VacinaProduto[] = [
  {
    id: "Influenza Vaccine (Injectable)",
    nome: "Influenza Vaccine",
    displayName: "Influenza Vaccine (Injectable)",
    via: "Injectable",
    formasDosagens: ["0.5 mL Prefilled Syringe", "Suspension for Injection"],
    rxcuis: ["2694010"],
    fonte: "RxTerms / ClinicalTables",
  },
  {
    id: "Hepatitis B Vaccine (Injectable)",
    nome: "Hepatitis B Vaccine",
    displayName: "Hepatitis B Vaccine (Injectable)",
    via: "Injectable",
    formasDosagens: ["20 mcg/ml Susp", "10 mcg/0.5 ml Prefilled Syringe"],
    rxcuis: [],
    fonte: "RxTerms / ClinicalTables",
  },
]

function normalizeQuery(q: string) {
  return q.trim().toLowerCase()
}

function parseDisplayName(displayName: string): Pick<VacinaProduto, "nome" | "via" | "displayName"> {
  const match = displayName.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (match) {
    return {
      nome: match[1].trim(),
      via: match[2].trim(),
      displayName: displayName.trim(),
    }
  }
  return { nome: displayName.trim(), via: "", displayName: displayName.trim() }
}

function mapRxTermsResponse(query: string, raw: rxterms.RxTermsRawResponse): VacinaSearchResponse {
  const [total, names, extra] = raw
  const forms = extra?.STRENGTHS_AND_FORMS ?? []
  const rxcuis = extra?.RXCUIS ?? []

  const items: VacinaProduto[] = (names ?? []).map((displayName, index) => {
    const parsed = parseDisplayName(displayName)
    const id = encodeURIComponent(parsed.displayName)
    return {
      id,
      ...parsed,
      formasDosagens: forms[index] ?? [],
      rxcuis: rxcuis[index] ?? [],
      fonte: "RxTerms / ClinicalTables",
    }
  })

  return {
    query,
    total: typeof total === "number" ? total : items.length,
    items,
    source: "rxterms",
  }
}

function searchFallback(query: string, limit: number): VacinaSearchResponse {
  const q = normalizeQuery(query)
  const items = FALLBACK_VACCINES.filter(
    (v) =>
      v.nome.toLowerCase().includes(q) ||
      v.displayName.toLowerCase().includes(q) ||
      v.via.toLowerCase().includes(q)
  ).slice(0, limit)

  return { query, total: items.length, items, source: "fallback" }
}

async function fetchFromApi(query: string, limit: number): Promise<VacinaSearchResponse> {
  const searchTerm = /\bvaccin|vacina|immun/i.test(query) ? query : `${query} vaccine`
  const raw = await rxterms.searchRxTerms(searchTerm, limit)
  return mapRxTermsResponse(query, raw)
}

export async function searchVacinas(query: string): Promise<VacinaSearchResponse> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_QUERY_LEN) {
    return { query: trimmed, total: 0, items: [], source: "rxterms" }
  }

  const cacheKey = normalizeQuery(trimmed)
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  try {
    const data = await fetchFromApi(trimmed, DEFAULT_LIMIT)
    const result = data.items.length > 0 ? data : searchFallback(trimmed, DEFAULT_LIMIT)
    searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result })
    return result
  } catch {
    const data = searchFallback(trimmed, DEFAULT_LIMIT)
    searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data })
    return data
  }
}

export async function getVacinaById(id: string): Promise<VacinaProduto | null> {
  const displayName = decodeURIComponent(id)
  return FALLBACK_VACCINES.find((v) => v.id === id || v.displayName === displayName) ?? null
}
