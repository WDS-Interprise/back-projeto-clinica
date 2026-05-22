const BULAPI_BASE = process.env.BULAPI_BASE_URL ?? "https://bulapi.com.br/api/v1"
const BULAPI_TIMEOUT_MS = Number(process.env.BULAPI_TIMEOUT_MS ?? 10000)

type BulapiMeta = {
  current_page: number
  total_pages: number
  total_count: number
  per_page: number
}

type BulapiProduct = {
  id: number
  name: string
  regulatory_category?: string
  substance?: { id: number; name: string }
  manufacturer?: { id: number; name: string }
}

type BulapiSearchResponse = {
  data?: {
    substances?: Array<{ id: number; name: string }>
    products?: BulapiProduct[]
  }
}

async function bulapiFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.BULAPI_KEY
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BULAPI_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const res = await fetch(`${BULAPI_BASE}${path}`, { headers, signal: controller.signal })
    if (!res.ok) throw new Error(`Bulapi HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export async function listBulapiProducts(params: { page: number; limit: number }) {
  const data = await bulapiFetch<{ data: BulapiProduct[]; meta: BulapiMeta }>(
    `/products?page=${params.page}&limit=${params.limit}`
  )
  return {
    items: data.data ?? [],
    total: data.meta?.total_count ?? 0,
    totalPages: data.meta?.total_pages ?? 1,
    page: data.meta?.current_page ?? params.page,
    limit: data.meta?.per_page ?? params.limit,
  }
}

export async function searchBulapi(q: string) {
  const data = await bulapiFetch<BulapiSearchResponse>(
    `/search?q=${encodeURIComponent(q.trim())}`
  )
  return data.data ?? { substances: [], products: [] }
}

export async function getBulapiProduct(id: string) {
  const data = await bulapiFetch<{ data: BulapiProduct }>(`/products/${encodeURIComponent(id)}`)
  return data.data ?? null
}

export async function getBulapiSubstance(id: string) {
  const data = await bulapiFetch<{ data: { id: number; name: string; cas_number?: string | null } }>(
    `/substances/${encodeURIComponent(id)}`
  )
  return data.data ?? null
}

export async function listBulapiSubstanceProducts(substanceId: string, limit = 5) {
  const data = await bulapiFetch<{ data: BulapiProduct[] }>(
    `/substances/${encodeURIComponent(substanceId)}/products?limit=${limit}`
  )
  return data.data ?? []
}

export type BulapiPresentation = {
  id: number
  name?: string
  package_description?: string | null
  ean?: string | null
  registro_ms?: string
  registration?: {
    registro_ms?: string
    status?: string
    expires_at?: string | null
  }
}

export async function listBulapiProductPresentations(productId: string, limit = 5) {
  const data = await bulapiFetch<{ data: BulapiPresentation[] }>(
    `/products/${encodeURIComponent(productId)}/presentations?limit=${limit}`
  )
  return data.data ?? []
}

export type BulapiPriceEntry = {
  id: number
  price_regime?: string
  pf_prices?: Record<string, number>
  pmc_prices?: Record<string, number>
  pmvg?: number | null
  effective_date?: string
  source_version?: string
}

/** PMC ao consumidor (ICMS 0%) ou fallback regulatório mais próximo. */
export function extractBulapiDisplayPrice(entry?: BulapiPriceEntry | null): number | null {
  if (!entry) return null

  const pmc = entry.pmc_prices
  if (pmc) {
    for (const key of ["0", "18", "17", "12", "sem_impostos"] as const) {
      const value = pmc[key]
      if (typeof value === "number" && value > 0) return value
    }
  }

  const pf = entry.pf_prices
  if (pf) {
    for (const key of ["0", "18", "sem_impostos"] as const) {
      const value = pf[key]
      if (typeof value === "number" && value > 0) return value
    }
  }

  if (typeof entry.pmvg === "number" && entry.pmvg > 0) return entry.pmvg
  return null
}

export async function getBulapiPresentationPrices(presentationId: string) {
  const data = await bulapiFetch<{ data: BulapiPriceEntry[] }>(
    `/presentations/${encodeURIComponent(presentationId)}/prices`
  )
  return data.data ?? []
}

export type { BulapiProduct }
