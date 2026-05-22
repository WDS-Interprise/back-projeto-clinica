import {
  dedupeParagraphs,
  splitDizeresLegais,
  type ParsedBulaSections,
} from "@/lib/bula-sections.js"

const CR_BASE = process.env.CONSULTAREMEDIOS_BASE_URL ?? "https://consultaremedios.com.br"
const CR_TIMEOUT_MS = Number(process.env.CONSULTAREMEDIOS_TIMEOUT_MS ?? 20000)

const SECTION_MAP: Record<string, keyof ParsedBulaSections> = {
  "para-que-serve": "indicacao",
  "como-funciona": "farmacocinetica",
  "acao-da-substancia": "farmacocinetica",
  contraindicacao: "contraindicacoes",
  "posologia-como-usar": "posologia",
  superdose: "superdosagem",
  precaucoes: "advertencias",
  riscos: "advertencias",
  "reacoes-adversas": "efeitosColaterais",
  "interacao-medicamentosa": "interacoes",
  apresentacoes: "apresentacoes",
  composicao: "composicao",
  "cuidados-de-armazenamento": "armazenamento",
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function substanceToCrSlug(substanceName: string) {
  const primary = substanceName.split(";")[0]?.trim() ?? substanceName
  return normalizeSlug(primary)
}

function stripProseHtml(html: string) {
  return dedupeParagraphs(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  )
}

function extractLeafletSections(html: string) {
  const sections = new Map<string, string>()
  const re =
    /id="([^"]+)" class="mb-4 leaflet-section"[\s\S]*?<div class="prose[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi

  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const id = match[1]
    const prose = match[2]
    if (!prose) continue
    const text = stripProseHtml(prose)
    if (!text) continue
    const existing = sections.get(id)
    sections.set(id, existing ? `${existing}\n\n${text}` : text)
  }

  return sections
}

function extractRegistroMs(dizeres?: string) {
  if (!dizeres) return undefined
  const match = dizeres.match(/Reg\.?\s*MS[-\s.]?([\d./-]+)/i)
  return match?.[1]?.replace(/\./g, "").trim()
}

function extractLaboratorio(dizeres?: string) {
  if (!dizeres) return undefined
  const lines = dizeres.split("\n").map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/secretaria|farmac|crf|uso sob|venda proibida/i.test(line)) continue
    if (line.length > 8 && /ltda|s\.?a\.?|indústria|industria|farmac/i.test(line)) {
      return line.replace(/\s+/g, " ")
    }
  }
  return undefined
}

function extractClasses(acao?: string, como?: string) {
  const source = [acao, como].filter(Boolean).join("\n")
  const match = source.match(
    /(?:classe(?:s)?|grupo)\s*(?:terap(?:ê|e)utica(?:s)?|farmacol(?:ó|o)gica(?:s)?)?[:\s]+([^\n.]+)/i
  )
  if (!match?.[1]) return undefined
  return match[1]
    .split(/[,;/|]+/)
    .map((c) => c.trim())
    .filter(Boolean)
}

export function parseConsultaRemediosBula(html: string): {
  parsed: ParsedBulaSections
  registroMs?: string
  informacoesLegais?: string
  laboratorio?: string
  classes?: string[]
  productTitle?: string
} {
  const blocks = extractLeafletSections(html)
  const parsed: ParsedBulaSections = {}

  for (const [id, text] of blocks) {
    const key = SECTION_MAP[id]
    if (!key) continue
    if (key === "farmacocinetica" && parsed.farmacocinetica) {
      parsed.farmacocinetica = dedupeParagraphs(`${parsed.farmacocinetica}\n\n${text}`)
    } else if (key === "advertencias" && parsed.advertencias) {
      parsed.advertencias = dedupeParagraphs(`${parsed.advertencias}\n\n${text}`)
    } else {
      parsed[key] = text
    }
  }

  const populacao = blocks.get("populacao-especial")
  if (populacao) {
    const posologiaText = parsed.posologia ?? ""
    parsed.posologia = dedupeParagraphs(
      posologiaText ? `${posologiaText}\n\n${populacao}` : populacao
    )
  }

  const titleMatch = html.match(/<h2[^>]*>([^<]{5,120})<\/h2>/i)
  const productTitle = titleMatch?.[1]?.replace(/, para o que.*$/i, "").trim()

  const dizeres = blocks.get("dizeres-legais")
  const legalSplit = dizeres ? splitDizeresLegais(dizeres) : {}
  const acao = blocks.get("acao-da-substancia")
  const como = blocks.get("como-funciona")
  const classList = extractClasses(acao, como)

  return {
    parsed,
    registroMs: extractRegistroMs(dizeres),
    informacoesLegais: legalSplit.informacoesLegais,
    laboratorio: legalSplit.laboratorio ?? extractLaboratorio(dizeres),
    classes: classList,
    productTitle,
  }
}

async function fetchCrHtml(slug: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CR_TIMEOUT_MS)
  try {
    const res = await fetch(`${CR_BASE}/${slug}/bula/profissional`, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const html = await res.text()
    if (!html.includes("leaflet-section")) return null
    return html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchConsultaRemediosBula(params: {
  substanceName: string
  productSlugHints?: string[]
}): Promise<ReturnType<typeof parseConsultaRemediosBula> | null> {
  const slugs = [
    ...(params.productSlugHints ?? []).map((s) => normalizeSlug(s)),
    substanceToCrSlug(params.substanceName),
  ].filter(Boolean)

  const tried = new Set<string>()
  for (const slug of slugs) {
    if (tried.has(slug)) continue
    tried.add(slug)
    const html = await fetchCrHtml(slug)
    if (!html) continue
    const parsed = parseConsultaRemediosBula(html)
    const sectionCount = Object.keys(parsed.parsed).length
    if (sectionCount >= 3) return parsed
  }

  return null
}
