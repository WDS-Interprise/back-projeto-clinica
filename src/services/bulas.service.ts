import * as anvisa from "@/lib/anvisa.client.js"
import * as bulapi from "@/lib/bulapi.client.js"
import * as cr from "@/lib/consultaremedios.client.js"
import * as pharmadb from "@/lib/pharmadb.client.js"
import {
  countFilledSections,
  parseBulaText,
  parsedToBulaSecoes,
  splitClasses,
  splitDizeresLegais,
} from "@/lib/bula-sections.js"
import type {
  BulaDetailPayload,
  BulaSummary,
  PaginatedBulasResponse,
} from "@/lib/bula-types.js"
import { BulaFetchError } from "@/lib/bula-types.js"
import * as bulaCache from "@/services/bula-cache.service.js"

type InternalMedicine = BulaSummary & {
  processNumber?: string
  bulaProfessionalId?: string
  bulaPatientId?: string
}

const REGULATORY_LABELS: Record<string, string> = {
  generic: "Genérico",
  similar: "Similar",
  new: "Novo",
  reference: "Referência",
}

const FONTE_LABELS: Record<string, string> = {
  anvisa: "Bulário Eletrônico / Anvisa",
  bulapi: "Bulapi + Bulário Anvisa",
  consultaremedios: "Consulta Remédios (Bulário Anvisa)",
  pharmadb: "PharmaDB / Bulário Anvisa",
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

export function substanceKey(name: string) {
  return normalize(name).replace(/[^a-z0-9]/g, "")
}

function titleCaseSubstance(name: string) {
  return name
    .split(";")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join("; ")
}

function pickBestSubstanceMatches<T extends { name: string }>(candidates: T[], query: string): T[] {
  const q = normalize(query)
  if (!q) return candidates

  const pureExact = candidates.filter((c) => normalize(c.name) === q)
  if (pureExact.length > 0) return pureExact

  const singleIngredient = candidates.filter(
    (c) => !c.name.includes(";") && normalize(c.name).includes(q)
  )
  const singleExact = singleIngredient.filter((c) => normalize(c.name) === q)
  if (singleExact.length > 0) return singleExact

  const scored = candidates
    .map((item) => ({
      item,
      score: scoreSubstanceMatch(item.name, q),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)

  const topScore = scored[0]?.score ?? 0
  if (topScore >= 85) return scored.filter((r) => r.score >= 85).map((r) => r.item)

  return scored.map((r) => r.item)
}

function scoreSubstanceMatch(substanceName: string, query: string): number {
  const sub = normalize(substanceName)
  const q = normalize(query)
  if (!q) return 0
  if (sub === q) return 100
  if (!sub.includes(";") && sub.includes(q)) return 90
  const parts = substanceName.split(";").map((p) => normalize(p.trim()))
  if (parts.some((p) => p === q)) return 85
  if (parts.some((p) => p.includes(q))) return 70
  if (sub.includes(q)) return 50
  return 0
}

function toSummary(item: InternalMedicine): BulaSummary {
  const { processNumber: _p, bulaProfessionalId: _b, bulaPatientId: _c, ...summary } = item
  return summary
}

function mapAnvisaItem(item: anvisa.AnvisaBulaItem): InternalMedicine {
  const processNumber = String(item.numProcesso ?? "")
  const patientId = item.idBulaPacienteProtegido
    ? String(item.idBulaPacienteProtegido)
    : undefined
  const professionalId = item.idBulaProfissionalProtegido
    ? String(item.idBulaProfissionalProtegido)
    : undefined
  const substance = item.principioAtivo ? String(item.principioAtivo) : undefined

  return {
    id: substance
      ? `anvisa-substance:${substanceKey(substance)}`
      : processNumber
        ? `anvisa:${processNumber}`
        : String(item.nomeProduto ?? ""),
    name: substance ? titleCaseSubstance(substance) : String(item.nomeProduto ?? "Medicamento"),
    substanceName: substance,
    manufacturerName: String(item.empresaNome ?? item.razaoSocial ?? "") || undefined,
    regulatoryCategory: item.categoriaRegulatoria
      ? String(item.categoriaRegulatoria)
      : undefined,
    processNumber: processNumber || undefined,
    bulaPatientId: patientId,
    bulaProfessionalId: professionalId,
  }
}

function dedupeAnvisaItems(items: anvisa.AnvisaBulaItem[], query?: string): InternalMedicine[] {
  const groups = new Map<string, InternalMedicine[]>()

  for (const item of items) {
    const mapped = mapAnvisaItem(item)
    const key = mapped.substanceName
      ? substanceKey(mapped.substanceName)
      : (mapped.processNumber ?? mapped.id)
    const list = groups.get(key) ?? []
    list.push(mapped)
    groups.set(key, list)
  }

  const q = query?.trim() ?? ""
  const results = [...groups.values()].map((group) => {
    const best = group.reduce((acc, cur) => {
      const accScore = scoreSubstanceMatch(acc.substanceName ?? acc.name, q)
      const curScore = scoreSubstanceMatch(cur.substanceName ?? cur.name, q)
      if (curScore > accScore) return cur
      if (curScore === accScore && cur.bulaProfessionalId && !acc.bulaProfessionalId) return cur
      return acc
    }, group[0])

    return {
      ...best,
      variantCount: group.length,
    }
  })

  if (q) {
    const wrapped = results.map((item) => ({
      item,
      name: item.substanceName ?? item.name,
    }))
    return pickBestSubstanceMatches(wrapped, q).map((entry) => entry.item)
  }

  return results
}

type BulapiSubstanceCandidate = {
  id: number
  name: string
  manufacturerName?: string
  regulatoryCategory?: string
  variantCount: number
}

function dedupeBulapiSearch(
  search: { substances?: Array<{ id: number; name: string }>; products?: bulapi.BulapiProduct[] },
  query?: string
): BulapiSubstanceCandidate[] {
  const map = new Map<number, BulapiSubstanceCandidate>()

  for (const substance of search.substances ?? []) {
    const existing = map.get(substance.id)
    map.set(substance.id, {
      id: substance.id,
      name: substance.name,
      manufacturerName: existing?.manufacturerName,
      regulatoryCategory: existing?.regulatoryCategory,
      variantCount: (existing?.variantCount ?? 0) + 1,
    })
  }

  for (const product of search.products ?? []) {
    if (!product.substance) continue
    const existing = map.get(product.substance.id)
    map.set(product.substance.id, {
      id: product.substance.id,
      name: product.substance.name,
      manufacturerName: existing?.manufacturerName ?? product.manufacturer?.name,
      regulatoryCategory:
        existing?.regulatoryCategory ??
        (product.regulatory_category
          ? REGULATORY_LABELS[product.regulatory_category] ?? product.regulatory_category
          : undefined),
      variantCount: (existing?.variantCount ?? 0) + 1,
    })
  }

  const q = query?.trim() ?? ""
  let candidates = [...map.values()]

  if (q) {
    candidates = pickBestSubstanceMatches(candidates, q)
  }

  return candidates.sort((a, b) => {
    const scoreDiff = scoreSubstanceMatch(b.name, q) - scoreSubstanceMatch(a.name, q)
    if (scoreDiff !== 0) return scoreDiff
    const aCombo = a.name.includes(";") ? 1 : 0
    const bCombo = b.name.includes(";") ? 1 : 0
    if (aCombo !== bCombo) return aCombo - bCombo
    return a.name.length - b.name.length
  })
}

function mapBulapiSubstance(item: BulapiSubstanceCandidate): InternalMedicine {
  return {
    id: `bulapi-substance:${item.id}`,
    name: titleCaseSubstance(item.name),
    substanceName: item.name,
    manufacturerName: item.manufacturerName,
    regulatoryCategory: item.regulatoryCategory,
    variantCount: item.variantCount,
  }
}

function paginateArray<T>(items: T[], page: number, limit: number) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * limit
  return {
    items: items.slice(start, start + limit),
    page: safePage,
    limit,
    total,
    totalPages,
  }
}

async function searchFromAnvisa(params: { q?: string; page: number; limit: number }) {
  const data = await anvisa.listAnvisaBulas(params)
  const deduped = dedupeAnvisaItems(data.items, params.q)
  const paged = paginateArray(deduped, params.page, params.limit)
  return {
    source: "anvisa" as const,
    items: paged.items.map(toSummary),
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
  }
}

async function searchFromBulapi(params: { q?: string; page: number; limit: number }) {
  if (params.q?.trim()) {
    const search = await bulapi.searchBulapi(params.q)
    const deduped = dedupeBulapiSearch(search, params.q).map(mapBulapiSubstance)
    const paged = paginateArray(deduped, params.page, params.limit)
    return {
      source: "bulapi" as const,
      items: paged.items.map(toSummary),
      page: paged.page,
      limit: paged.limit,
      total: paged.total,
      totalPages: paged.totalPages,
    }
  }

  const data = await bulapi.listBulapiProducts(params)
  const bySubstance = dedupeBulapiSearch({ products: data.items }, params.q).map(mapBulapiSubstance)
  const paged = paginateArray(bySubstance, params.page, params.limit)
  return {
    source: "bulapi" as const,
    items: paged.items.map(toSummary),
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
  }
}

export async function searchMedicinesPaginated(params: {
  q?: string
  page?: number
  limit?: number
}): Promise<PaginatedBulasResponse> {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(Math.max(1, params.limit ?? 20), 50)
  const q = params.q?.trim()

  const empty: PaginatedBulasResponse = {
    source: "anvisa",
    items: [],
    page: 1,
    limit,
    total: 0,
    totalPages: 1,
  }

  if (q) {
    try {
      return await searchFromBulapi({ q, page, limit })
    } catch {
      try {
        return await searchFromAnvisa({ q, page, limit })
      } catch {
        return empty
      }
    }
  }

  try {
    return await searchFromAnvisa({ q, page, limit })
  } catch {
    try {
      return await searchFromBulapi({ q, page, limit })
    } catch {
      return empty
    }
  }
}

async function fetchAnvisaSections(
  bulaIds: string[],
  substanceName?: string
): Promise<{
  parsed: ReturnType<typeof parseBulaText>
  bulaPdfId?: string
  registroMs?: string
  laboratorio?: string
  classes?: string[]
} | null> {
  const idsToTry: string[] = [...new Set(bulaIds.filter(Boolean))]

  if (substanceName) {
    try {
      const hits = await anvisa.searchAnvisaBySubstance(substanceName, 5)
      for (const hit of hits) {
        const pro = hit.idBulaProfissionalProtegido
          ? String(hit.idBulaProfissionalProtegido)
          : undefined
        const pat = hit.idBulaPacienteProtegido
          ? String(hit.idBulaPacienteProtegido)
          : undefined
        if (pro) idsToTry.push(pro)
        if (pat) idsToTry.push(pat)
      }
    } catch {
      // ANVISA indisponível na busca por substância
    }
  }

  let bestParsed: ReturnType<typeof parseBulaText> | null = null
  let bestCount = 0
  let bulaPdfId: string | undefined
  let registroMs: string | undefined
  let laboratorio: string | undefined
  let classes: string[] | undefined

  for (const id of [...new Set(idsToTry)]) {
    const raw = await anvisa.fetchAnvisaBulaRaw(id)
    if (!raw) continue
    const parsed = parseBulaText(raw)
    const sectionCount = Object.keys(parsed).length
    if (sectionCount > bestCount) {
      bestParsed = parsed
      bestCount = sectionCount
      bulaPdfId = id
    }
    if (sectionCount >= 4) break
  }

  if (!bestParsed || bestCount < 2) return null

  if (substanceName) {
    try {
      const hits = await anvisa.searchAnvisaBySubstance(substanceName, 1)
      const hit = hits[0]
      if (hit?.numProcesso) {
        const detail = await anvisa.getAnvisaMedicine(String(hit.numProcesso))
        registroMs = anvisa.extractRegistroMs(detail) ?? registroMs
        laboratorio =
          String(detail.empresaNome ?? detail.razaoSocial ?? "") || laboratorio
        const tc = anvisa.extractTherapeuticClass(detail)
        if (tc) classes = splitClasses(tc)
      }
    } catch {
      // metadados opcionais
    }
  }

  return {
    parsed: bestParsed,
    bulaPdfId,
    registroMs,
    laboratorio,
    classes: classes ?? (bestParsed.classes ? splitClasses(bestParsed.classes) : undefined),
  }
}

async function resolveBulapiMetadata(substanceId: string) {
  const substance = await bulapi.getBulapiSubstance(substanceId)
  if (!substance) return null

  const products = await bulapi.listBulapiSubstanceProducts(substanceId, 15)
  const product =
    products.find((p) => p.regulatory_category === "reference") ??
    products.find((p) => p.regulatory_category === "new") ??
    products[0]

  let registroMs: string | undefined
  if (product) {
    const presentations = await bulapi.listBulapiProductPresentations(String(product.id), 3)
    registroMs =
      presentations.find((p) => p.registration?.registro_ms)?.registration?.registro_ms ??
      presentations.find((p) => (p as { registro_ms?: string }).registro_ms)?.registro_ms
  }

  const productSlugHints = products
    .filter((p) => !p.substance?.name.includes(";"))
    .slice(0, 5)
    .map((p) => p.name)

  return {
    name: titleCaseSubstance(substance.name),
    substanceName: substance.name,
    manufacturerName: product?.manufacturer?.name,
    registroMs,
    productSlugHints,
    bulaProfessionalId: undefined as string | undefined,
  }
}

async function resolveAnvisaSubstance(id: string, key: string) {
  const hits = await anvisa.listAnvisaBulas({ q: key, page: 1, limit: 30 })
  const deduped = dedupeAnvisaItems(hits.items)
  const match =
    deduped.find((d) => substanceKey(d.substanceName ?? d.name) === key) ?? deduped[0]
  if (!match) return null

  return {
    id,
    name: match.name,
    substanceName: match.substanceName ?? match.name,
    manufacturerName: match.manufacturerName,
    bulaProfessionalId: match.bulaProfessionalId,
    bulaPatientId: match.bulaPatientId,
    processNumber: match.processNumber,
  }
}

type BulaSource = "anvisa" | "bulapi" | "consultaremedios" | "pharmadb"

function buildPayload(params: {
  id: string
  nome: string
  substanceName: string
  source: BulaSource
  parsed: ReturnType<typeof parseBulaText>
  classes?: string[]
  registroMs?: string
  informacoesLegais?: string
  laboratorio?: string
  urlPdf?: string
}): BulaDetailPayload {
  const secoes = parsedToBulaSecoes(params.parsed)
  delete secoes.dizeres_legais

  const dizeresRaw = params.parsed.dizeresLegais
  const splitLegal = dizeresRaw ? splitDizeresLegais(dizeresRaw) : {}

  const classesFromParsed = params.parsed.classes ? splitClasses(params.parsed.classes) : []
  const classes = [...new Set([...(params.classes ?? []), ...classesFromParsed])]

  return {
    id: params.id,
    nome: params.nome,
    classes,
    fonte: FONTE_LABELS[params.source] ?? params.source,
    registro_ms: params.registroMs,
    informacoes_legais: params.informacoesLegais ?? splitLegal.informacoesLegais,
    laboratorio: params.laboratorio ?? splitLegal.laboratorio,
    secoes,
    url_pdf: params.urlPdf,
    atualizado_em: new Date().toISOString().slice(0, 10),
  }
}

async function fetchConsultaRemediosSections(params: {
  substanceName: string
  productSlugHints?: string[]
}) {
  const result = await cr.fetchConsultaRemediosBula({
    substanceName: params.substanceName,
    productSlugHints: params.productSlugHints,
  })
  if (!result) return null

  return {
    parsed: result.parsed,
    registroMs: result.registroMs,
    informacoesLegais: result.informacoesLegais,
    laboratorio: result.laboratorio,
    classes: result.classes,
    displayName: result.productTitle,
  }
}

async function fetchPharmadbSections(substanceName: string) {
  const detail = await pharmadb.fetchPharmadbBula(substanceName)
  if (!detail) return null

  const parsed: ReturnType<typeof parseBulaText> = {}
  if (detail.texto_indicacoes) parsed.indicacao = detail.texto_indicacoes
  if (detail.texto_contraindicacoes) parsed.contraindicacoes = detail.texto_contraindicacoes
  if (detail.texto_posologia) parsed.posologia = detail.texto_posologia
  if (detail.texto_reacoes_adversas) parsed.efeitosColaterais = detail.texto_reacoes_adversas
  if (detail.texto_interacoes) parsed.interacoes = detail.texto_interacoes

  const classes = detail.produto?.classe_terapeutica
    ? splitClasses(detail.produto.classe_terapeutica)
    : undefined

  return {
    parsed,
    registroMs: detail.produto?.registro_anvisa,
    laboratorio: detail.produto?.laboratorio,
    classes,
    displayName: detail.produto?.nome,
  }
}

async function fetchAndBuildDetail(params: {
  id: string
  nome: string
  substanceName: string
  source: BulaSource
  bulaProfessionalId?: string
  bulaPatientId?: string
  manufacturerName?: string
  registroMs?: string
  productSlugHints?: string[]
}): Promise<BulaDetailPayload> {
  const anvisaResult = await fetchAnvisaSections(
    [params.bulaProfessionalId, params.bulaPatientId].filter((x): x is string => Boolean(x)),
    params.substanceName
  )

  let resolvedSource: BulaSource = "anvisa"
  let parsed = anvisaResult?.parsed
  let registroMs = params.registroMs ?? anvisaResult?.registroMs
  let informacoesLegais: string | undefined
  let laboratorio = anvisaResult?.laboratorio
  let classes = anvisaResult?.classes
  let urlPdf = anvisaResult?.bulaPdfId
    ? anvisa.anvisaBulaPdfUrl(anvisaResult.bulaPdfId)
    : undefined
  let displayName = params.nome

  if (!parsed || Object.keys(parsed).length < 2) {
    const crResult = await fetchConsultaRemediosSections({
      substanceName: params.substanceName,
      productSlugHints: params.productSlugHints,
    })
    if (crResult) {
      resolvedSource = "consultaremedios"
      parsed = crResult.parsed
      registroMs = registroMs ?? crResult.registroMs
      informacoesLegais = crResult.informacoesLegais
      laboratorio = laboratorio ?? crResult.laboratorio
      classes = classes ?? crResult.classes
    }
  }

  if (!parsed || Object.keys(parsed).length < 2) {
    const pharmaResult = await fetchPharmadbSections(params.substanceName)
    if (pharmaResult) {
      resolvedSource = "pharmadb"
      parsed = pharmaResult.parsed
      registroMs = registroMs ?? pharmaResult.registroMs
      laboratorio = laboratorio ?? pharmaResult.laboratorio
      classes = classes ?? pharmaResult.classes
      if (pharmaResult.displayName) displayName = pharmaResult.displayName
    }
  }

  if (!parsed || Object.keys(parsed).length < 2) {
    const hint = pharmadb.isPharmadbConfigured()
      ? " Tente novamente mais tarde."
      : " A API da Anvisa está bloqueada neste ambiente; configure PHARMADB_API_KEY no backend como alternativa oficial."
    throw new BulaFetchError(
      `Não foi possível obter o texto completo da bula nas fontes oficiais.${hint}`,
      "UNAVAILABLE"
    )
  }

  const payload = buildPayload({
    id: params.id,
    nome: displayName,
    substanceName: params.substanceName,
    source: resolvedSource,
    parsed,
    classes,
    registroMs,
    informacoesLegais,
    laboratorio,
    urlPdf,
  })

  if (countFilledSections(payload.secoes) < 2) {
    throw new BulaFetchError(
      "A bula retornada pela fonte oficial está incompleta. Tente outro medicamento ou mais tarde.",
      "INCOMPLETE"
    )
  }

  await bulaCache.saveBulaToCache({
    externalId: params.id,
    substanceKey: substanceKey(params.substanceName),
    substanceName: params.substanceName,
    source: resolvedSource,
    payload,
  })

  return payload
}

export async function getBulaDetail(id: string): Promise<BulaDetailPayload> {
  const cached = await bulaCache.getBulaFromCache(id)
  if (cached) return cached

  if (id.startsWith("bulapi-substance:")) {
    const substanceId = id.slice("bulapi-substance:".length)
    const meta = await resolveBulapiMetadata(substanceId)
    if (!meta) throw new BulaFetchError("Substância não encontrada", "NOT_FOUND")

    return fetchAndBuildDetail({
      id,
      nome: meta.name,
      substanceName: meta.substanceName,
      source: "bulapi",
      manufacturerName: meta.manufacturerName,
      registroMs: meta.registroMs,
      productSlugHints: meta.productSlugHints,
    })
  }

  if (id.startsWith("bulapi:")) {
    const productId = id.slice("bulapi:".length)
    const product = await bulapi.getBulapiProduct(productId)
    if (!product?.substance) throw new BulaFetchError("Produto não encontrado", "NOT_FOUND")
    return getBulaDetail(`bulapi-substance:${product.substance.id}`)
  }

  if (id.startsWith("anvisa-substance:")) {
    const key = id.slice("anvisa-substance:".length)
    const meta = await resolveAnvisaSubstance(id, key)
    if (!meta) throw new BulaFetchError("Substância não encontrada no Bulário", "NOT_FOUND")

    return fetchAndBuildDetail({
      id,
      nome: meta.name,
      substanceName: meta.substanceName,
      source: "anvisa",
      bulaProfessionalId: meta.bulaProfessionalId,
      bulaPatientId: meta.bulaPatientId,
      manufacturerName: meta.manufacturerName,
    })
  }

  if (id.startsWith("anvisa:")) {
    const processNumber = id.slice("anvisa:".length)
    const detail = await anvisa.getAnvisaMedicine(processNumber)
    const mapped = mapAnvisaItem({
      ...detail,
      numProcesso: processNumber,
    } as anvisa.AnvisaBulaItem)

    return fetchAndBuildDetail({
      id: mapped.id,
      nome: mapped.name,
      substanceName: mapped.substanceName ?? mapped.name,
      source: "anvisa",
      bulaProfessionalId: mapped.bulaProfessionalId,
      bulaPatientId: mapped.bulaPatientId,
      manufacturerName: mapped.manufacturerName,
      registroMs: anvisa.extractRegistroMs(detail),
    })
  }

  throw new BulaFetchError("Identificador de bula inválido", "NOT_FOUND")
}
