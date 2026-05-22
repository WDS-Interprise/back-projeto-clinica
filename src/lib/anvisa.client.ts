const ANVISA_BASE = process.env.ANVISA_BASE_URL ?? "https://consultas.anvisa.gov.br"
const ANVISA_TIMEOUT_MS = Number(process.env.ANVISA_TIMEOUT_MS ?? 15000)

export type AnvisaBulaItem = {
  numProcesso?: string
  nomeProduto?: string
  empresaNome?: string
  razaoSocial?: string
  categoriaRegulatoria?: string
  principioAtivo?: string
  idBulaPacienteProtegido?: string
  idBulaProfissionalProtegido?: string
  [key: string]: unknown
}

type AnvisaListResponse = {
  content?: AnvisaBulaItem[]
  totalElements?: number
  totalPages?: number
  size?: number
  number?: number
}

function anvisaHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: "Guest",
    Referer: "https://consultas.anvisa.gov.br/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  }
}

async function anvisaFetch<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANVISA_TIMEOUT_MS)
  try {
    const res = await fetch(`${ANVISA_BASE}${path}`, {
      headers: anvisaHeaders(),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`ANVISA HTTP ${res.status}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export function anvisaBulaUrl(idBulaProtegido: string) {
  return `${ANVISA_BASE}/api/consulta/medicamentos/arquivo/bula/parecer/${idBulaProtegido}/?Authorization=`
}

export function anvisaBulaPdfUrl(idBulaProtegido: string) {
  return anvisaBulaUrl(idBulaProtegido)
}

export function extractRegistroMs(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.numeroRegistro,
    record.numeroRegistroProduto,
    record.registro,
    record.codigoRegistro,
  ]
  for (const value of candidates) {
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return undefined
}

export function extractTherapeuticClass(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.classeTerapeutica,
    record.classeTerapeuticaNome,
    record.therapeuticClass,
  ]
  for (const value of candidates) {
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return undefined
}

export async function listAnvisaBulas(params: { q?: string; page: number; limit: number }) {
  const search = new URLSearchParams()
  search.set("count", String(params.limit))
  search.set("page", String(params.page))
  if (params.q?.trim()) {
    search.set("filter[nomeProduto]", params.q.trim())
  }

  const data = await anvisaFetch<AnvisaListResponse>(
    `/api/consulta/bulario?${search.toString()}`
  )

  const items = data.content ?? []
  const total = data.totalElements ?? items.length
  const totalPages = data.totalPages ?? Math.max(1, Math.ceil(total / params.limit))

  return { items, total, totalPages }
}

export async function getAnvisaMedicine(numProcesso: string) {
  return anvisaFetch<Record<string, unknown>>(
    `/api/consulta/medicamento/produtos/${encodeURIComponent(numProcesso)}`
  )
}

export async function fetchAnvisaBulaRaw(idBulaProtegido: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANVISA_TIMEOUT_MS)
  try {
    const res = await fetch(anvisaBulaUrl(idBulaProtegido), {
      headers: {
        ...anvisaHeaders(),
        Accept: "text/html,application/xhtml+xml,application/pdf,text/plain,*/*",
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") ?? ""
    if (contentType.includes("pdf")) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function searchAnvisaBySubstance(substance: string, limit = 5) {
  const search = new URLSearchParams()
  search.set("count", String(limit))
  search.set("page", "1")
  search.set("filter[principioAtivo]", substance.trim())
  const data = await anvisaFetch<AnvisaListResponse>(`/api/consulta/bulario?${search.toString()}`)
  return data.content ?? []
}
