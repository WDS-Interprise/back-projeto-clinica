import * as bulapi from "@/lib/bulapi.client.js"
import { expandMedicineQueryTerms } from "@/lib/medicine-aliases.js"
import { formatRegulatoryCategory } from "@/lib/regulatory-labels.js"
import * as bulasService from "@/services/bulas.service.js"
import type {
  MedicamentoProduto,
  MedicamentoSearchResponse,
  MedicamentoSubstancia,
} from "@/types/medicamento.js"

const MIN_QUERY_LEN = 2
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_RESULTS = 50
const MAX_PRICE_LOOKUPS = 20
const PRICE_LOOKUP_CONCURRENCY = 5

type CacheEntry = { expiresAt: number; data: MedicamentoSearchResponse }

const searchCache = new Map<string, CacheEntry>()

function parsePackageFromName(name: string): { form?: string; quantity?: string } {
  const qtyMatch = name.match(/(\d+)\s*un(?:idades)?/i)
  const formMatch = name.match(
    /\b(comprimido|capsula|cápsula|xarope|solução|suspensão|gotas|injetável|ampola|frasco|creme|pomada|gel)\b/i
  )
  return {
    form: formMatch?.[1],
    quantity: qtyMatch ? `${qtyMatch[1]} un` : undefined,
  }
}

function mapProduct(
  product: bulapi.BulapiProduct,
  index: number,
  query: string,
  price?: number | null
): MedicamentoProduto {
  const parsed = parsePackageFromName(product.name)
  const nameLower = product.name.toLowerCase()
  const qLower = query.toLowerCase()
  const highlighted =
    index < 3 || nameLower.startsWith(qLower) || nameLower.includes(` ${qLower}`)

  return {
    id: `bulapi-product:${product.id}`,
    bulapiProductId: product.id,
    name: product.name,
    activeIngredient: product.substance?.name,
    pharmaceuticalForm: parsed.form,
    packageQuantity: parsed.quantity,
    laboratory: product.manufacturer?.name,
    productType: formatRegulatoryCategory(product.regulatory_category),
    price: price ?? null,
    currency: "BRL",
    highlighted,
  }
}

async function resolveBulapiProductPrice(productId: number): Promise<number | null> {
  try {
    const presentations = await bulapi.listBulapiProductPresentations(String(productId), 3)
    const presentation =
      presentations.find((p) => p.ean && p.package_description) ?? presentations[0]
    if (!presentation?.id) return null

    const prices = await bulapi.getBulapiPresentationPrices(String(presentation.id))
    return bulapi.extractBulapiDisplayPrice(prices[0])
  } catch {
    return null
  }
}

async function enrichProductsWithPrices(products: MedicamentoProduto[]): Promise<void> {
  const targets = products.filter((p) => p.bulapiProductId != null).slice(0, MAX_PRICE_LOOKUPS)

  for (let i = 0; i < targets.length; i += PRICE_LOOKUP_CONCURRENCY) {
    const batch = targets.slice(i, i + PRICE_LOOKUP_CONCURRENCY)
    await Promise.all(
      batch.map(async (product) => {
        if (product.bulapiProductId == null) return
        product.price = await resolveBulapiProductPrice(product.bulapiProductId)
      })
    )
  }
}

function mapSubstance(
  substance: { id: number; name: string },
  productCount: number
): MedicamentoSubstancia {
  return {
    id: `bulapi-substance:${substance.id}`,
    bulapiSubstanceId: substance.id,
    name: substance.name,
    productCount,
  }
}

function countProductsBySubstance(products: bulapi.BulapiProduct[]) {
  const counts = new Map<number, number>()
  for (const p of products) {
    if (!p.substance) continue
    counts.set(p.substance.id, (counts.get(p.substance.id) ?? 0) + 1)
  }
  return counts
}

function mapCatalogSearch(
  query: string,
  bulaSearch: Awaited<ReturnType<typeof bulasService.searchMedicinesPaginated>>
): MedicamentoSearchResponse {
  const products: MedicamentoProduto[] = bulaSearch.items.map((item, index) => ({
    id: item.id,
    name: item.name,
    activeIngredient: item.substanceName,
    presentation: item.regulatoryCategory,
    laboratory: item.manufacturerName,
    productType: item.regulatoryCategory,
    price: null,
    currency: "BRL",
    highlighted: index < 3,
  }))
  const substances: MedicamentoSubstancia[] = bulaSearch.items
    .filter((item) => item.substanceName)
    .map((item) => ({
      id: item.id,
      name: item.substanceName!,
      productCount: item.variantCount,
    }))

  return {
    query,
    products,
    substances,
    totalProducts: products.length,
    totalSubstances: substances.length,
    source: "catalog",
  }
}

async function searchViaCatalog(query: string): Promise<MedicamentoSearchResponse | null> {
  for (const term of expandMedicineQueryTerms(query)) {
    const bulaSearch = await bulasService.searchMedicinesPaginated({
      q: term,
      page: 1,
      limit: MAX_RESULTS,
    })
    if (bulaSearch.items.length > 0) return mapCatalogSearch(query, bulaSearch)
  }
  return null
}

function mapBulapiSearch(
  query: string,
  search: Awaited<ReturnType<typeof bulapi.searchBulapi>>
): MedicamentoSearchResponse {
  const products = (search.products ?? []).slice(0, MAX_RESULTS)
  const substanceCounts = countProductsBySubstance(search.products ?? [])

  const substanceMap = new Map<number, MedicamentoSubstancia>()
  for (const s of search.substances ?? []) {
    substanceMap.set(s.id, mapSubstance(s, substanceCounts.get(s.id) ?? 0))
  }
  for (const p of products) {
    if (!p.substance || substanceMap.has(p.substance.id)) continue
    substanceMap.set(
      p.substance.id,
      mapSubstance(p.substance, substanceCounts.get(p.substance.id) ?? 1)
    )
  }

  const substances = [...substanceMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, MAX_RESULTS)

  return {
    query,
    products: products.map((p, i) => mapProduct(p, i, query)),
    substances,
    totalProducts: products.length,
    totalSubstances: substances.length,
    source: "bulapi",
  }
}

export async function searchMedicamentos(q: string): Promise<MedicamentoSearchResponse> {
  const query = q.trim()
  if (query.length < MIN_QUERY_LEN) {
    return {
      query,
      products: [],
      substances: [],
      totalProducts: 0,
      totalSubstances: 0,
      source: "bulapi",
    }
  }

  const cacheKey = query.toLowerCase()
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, source: "cache" }
  }

  try {
    for (const term of expandMedicineQueryTerms(query)) {
      const search = await bulapi.searchBulapi(term)
      const hasHits = (search.products?.length ?? 0) > 0 || (search.substances?.length ?? 0) > 0
      if (!hasHits) continue

      const result = mapBulapiSearch(query, search)
      await enrichProductsWithPrices(result.products)
      searchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result })
      return result
    }
  } catch {
    // Bulapi indisponível: tenta catálogo abaixo
  }

  try {
    const catalog = await searchViaCatalog(query)
    if (catalog) {
      searchCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, data: catalog })
      return catalog
    }
  } catch {
    // cascata bulas indisponível
  }

  const fallback = buildFallback(query)
  if (fallback.totalProducts > 0) {
    searchCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, data: fallback })
  }
  return fallback
}

function buildFallback(query: string): MedicamentoSearchResponse {
  const q = query.toLowerCase()
  if (!q.includes("dip")) {
    return {
      query,
      products: [],
      substances: [],
      totalProducts: 0,
      totalSubstances: 0,
      source: "fallback",
    }
  }

  const products: MedicamentoProduto[] = [
    {
      id: "fallback-1",
      name: "Dipirona 1 g comprimido. 10 un",
      activeIngredient: "Dipirona 1 g",
      pharmaceuticalForm: "Comprimido",
      packageQuantity: "10 un",
      laboratory: "Prati Donaduzzi",
      productType: "Genérico",
      price: 9.55,
      currency: "BRL",
      highlighted: true,
    },
    {
      id: "fallback-2",
      name: "Novalgina Flash 1 g + 130 mg comprimido. 8 un",
      activeIngredient: "Dipirona 1 g + Cafeína 130 mg",
      pharmaceuticalForm: "Comprimido",
      packageQuantity: "8 un",
      laboratory: "Sanofi",
      productType: "Referência",
      price: 22.92,
      currency: "BRL",
      highlighted: true,
    },
  ]

  const substances: MedicamentoSubstancia[] = [
    { id: "fallback-sub-1", name: "Dipirona", productCount: 12 },
    { id: "fallback-sub-2", name: "Dipirona sódica", productCount: 8 },
    { id: "fallback-sub-3", name: "Dipirona monoidratada", productCount: 4 },
  ]

  return {
    query,
    products,
    substances,
    totalProducts: products.length,
    totalSubstances: substances.length,
    source: "fallback",
  }
}

export async function getMedicamentoProduto(id: string): Promise<MedicamentoProduto | null> {
  if (id.startsWith("bulapi-product:")) {
    const productId = id.slice("bulapi-product:".length)
    const product = await bulapi.getBulapiProduct(productId)
    if (!product) return null
    const presentations = await bulapi.listBulapiProductPresentations(productId, 1)
    const price = await resolveBulapiProductPrice(product.id)
    const mapped = mapProduct(product, 0, product.name, price)
    const presentation = presentations[0]
    if (presentation?.package_description) {
      mapped.presentation = presentation.package_description
    } else if (presentation?.name) {
      mapped.presentation = presentation.name
    }
    return mapped
  }
  return null
}
