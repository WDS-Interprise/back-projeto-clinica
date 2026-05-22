const TUSS_BASE =
  process.env.TUSS_BASE_URL ?? "https://brasilapi.com.br/api/tuss/v1"
const TUSS_TIMEOUT_MS = Number(process.env.TUSS_TIMEOUT_MS ?? 10000)

export type TussApiItem = {
  tuss: string
  name: string
}

export type TussApiListResponse = {
  total: number
  limit: number
  offset: number
  items: TussApiItem[]
}

async function tussFetch<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TUSS_TIMEOUT_MS)
  try {
    const res = await fetch(`${TUSS_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`TUSS HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function normalizeListResponse(
  raw: TussApiListResponse | { value?: TussApiItem[]; Count?: number },
  limit: number
): TussApiListResponse {
  if ("items" in raw && Array.isArray(raw.items)) {
    return raw
  }
  const items = "value" in raw && Array.isArray(raw.value) ? raw.value : []
  return {
    total: "Count" in raw && typeof raw.Count === "number" ? raw.Count : items.length,
    limit,
    offset: 0,
    items,
  }
}

/** Autocomplete leve (prefixo, até 20 itens). */
export async function autocompleteTuss(q: string, limit = 20) {
  const safeLimit = Math.min(Math.max(limit, 1), 20)
  const params = new URLSearchParams({
    q: q.trim(),
    limit: String(safeLimit),
  })
  const raw = await tussFetch<TussApiListResponse | { value?: TussApiItem[]; Count?: number }>(
    `/autocomplete?${params}`
  )
  return normalizeListResponse(raw, safeLimit)
}

/** Busca avançada com campo livre. */
export async function searchTuss(params: {
  q?: string
  name?: string
  tuss?: string
  limit?: number
  offset?: number
  match?: "prefix" | "exact"
}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q.trim())
  if (params.name) qs.set("name", params.name.trim())
  if (params.tuss) qs.set("tuss", params.tuss.replace(/\D/g, ""))
  if (params.match) qs.set("match", params.match)
  qs.set("limit", String(params.limit ?? 20))
  qs.set("offset", String(params.offset ?? 0))
  qs.set("sort", "name")
  qs.set("order", "asc")
  const raw = await tussFetch<TussApiListResponse | { value?: TussApiItem[]; Count?: number }>(
    `/search?${qs}`
  )
  return normalizeListResponse(raw, params.limit ?? 20)
}

/** Lista com filtros name/tuss (GET /tuss/v1). */
export async function listTuss(params: {
  name?: string
  tuss?: string
  limit?: number
  offset?: number
}) {
  const qs = new URLSearchParams()
  if (params.name) qs.set("name", params.name.trim())
  if (params.tuss) qs.set("tuss", params.tuss.replace(/\D/g, ""))
  qs.set("limit", String(params.limit ?? 20))
  qs.set("offset", String(params.offset ?? 0))
  const suffix = qs.toString()
  const raw = await tussFetch<TussApiListResponse | { value?: TussApiItem[]; Count?: number }>(
    suffix ? `?${suffix}` : ""
  )
  return normalizeListResponse(raw, params.limit ?? 20)
}

export async function getTussByCode(code: string) {
  const digits = code.replace(/\D/g, "")
  return tussFetch<TussApiItem>(`/${encodeURIComponent(digits)}`)
}
