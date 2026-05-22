const PHARMADB_BASE = process.env.PHARMADB_BASE_URL ?? "https://api.pharmadb.com.br"
const PHARMADB_TIMEOUT_MS = Number(process.env.PHARMADB_TIMEOUT_MS ?? 15000)

type PharmadbToken = { access_token: string; expires_at: number }

let cachedToken: PharmadbToken | null = null

async function pharmadbFetch<T>(path: string, token: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PHARMADB_TIMEOUT_MS)
  try {
    const res = await fetch(`${PHARMADB_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`PharmaDB HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function getToken(): Promise<string | null> {
  const apiKey = process.env.PHARMADB_API_KEY?.trim()
  if (!apiKey) return null

  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PHARMADB_TIMEOUT_MS)
  try {
    const res = await fetch(`${PHARMADB_BASE}/auth/token`, {
      method: "POST",
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token: string; expires_in?: number }
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return cachedToken.access_token
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

type PharmadbBulaSummary = {
  id: number
  tipo?: string
  produto_nome?: string
  produto_id?: number
}

type PharmadbBulaDetail = {
  id: number
  tipo?: string
  produto?: {
    id: number
    nome: string
    registro_anvisa?: string
    laboratorio?: string
    principios_ativos?: string[]
    classe_terapeutica?: string
  }
  texto_indicacoes?: string
  texto_contraindicacoes?: string
  texto_interacoes?: string
  texto_posologia?: string
  texto_reacoes_adversas?: string
  extraido_em?: string
}

function normalizeTerm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function pickBestBula(items: PharmadbBulaSummary[], substanceName: string) {
  const term = normalizeTerm(substanceName.split(";")[0] ?? substanceName)
  const scored = items.map((item) => {
    const name = normalizeTerm(item.produto_nome ?? "")
    let score = 0
    if (name === term) score += 100
    if (name.includes(term)) score += 50
    if (item.tipo === "profissional") score += 20
    return { item, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.item
}

export async function fetchPharmadbBula(substanceName: string) {
  const token = await getToken()
  if (!token) return null

  const q = encodeURIComponent(substanceName.split(";")[0]?.trim() ?? substanceName)
  const search = await pharmadbFetch<{ items?: PharmadbBulaSummary[] }>(
    `/v1/bulas/busca?q=${q}&page=1&per_page=20`,
    token
  )

  const pick = pickBestBula(search.items ?? [], substanceName)
  if (!pick) return null

  const detail = await pharmadbFetch<PharmadbBulaDetail>(`/v1/bulas/${pick.id}`, token)
  return detail
}

export function isPharmadbConfigured() {
  return Boolean(process.env.PHARMADB_API_KEY?.trim())
}
