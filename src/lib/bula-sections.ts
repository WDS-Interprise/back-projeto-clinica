import type { BulaPosologia, BulaSecoes } from "@/lib/bula-types.js"

export type ParsedBulaSections = {
  nome?: string
  classes?: string
  indicacao?: string
  farmacocinetica?: string
  contraindicacoes?: string
  posologia?: string
  efeitosColaterais?: string
  advertencias?: string
  interacoes?: string
  superdosagem?: string
  composicao?: string
  apresentacoes?: string
  armazenamento?: string
  dizeresLegais?: string
}

const SECTION_ALIASES: Array<{ key: keyof ParsedBulaSections; patterns: RegExp[] }> = [
  {
    key: "indicacao",
    patterns: [/^INDICA(?:Ç|C)(?:Õ|O)ES?$/i, /^PARA QUE ESTE MEDICAMENTO/i],
  },
  {
    key: "contraindicacoes",
    patterns: [/^CONTRAINDICA(?:Ç|C)(?:Õ|O)ES?$/i],
  },
  {
    key: "advertencias",
    patterns: [
      /^ADVERT(?:Ê|E)NCIAS? E PRECAU(?:Ç|C)(?:Õ|O)ES?$/i,
      /^ADVERT(?:Ê|E)NCIAS?$/i,
      /^PRECAU(?:Ç|C)(?:Õ|O)ES?$/i,
    ],
  },
  {
    key: "interacoes",
    patterns: [
      /^INTERA(?:Ç|C)(?:Õ|O)ES? MEDICAMENTOSAS?$/i,
      /^INTERA(?:Ç|C)(?:Õ|O)ES?$/i,
    ],
  },
  {
    key: "efeitosColaterais",
    patterns: [
      /^REA(?:Ç|C)(?:Õ|O)ES? ADVERSAS?$/i,
      /^EFEITOS COLATERAIS?$/i,
      /^O QUE DEVO SABER QUANDO/i,
    ],
  },
  {
    key: "posologia",
    patterns: [
      /^POSOLOGIA(?: E MODO DE USAR)?$/i,
      /^COMO DEVO USAR ESTE MEDICAMENTO\??$/i,
      /^MODO DE USAR$/i,
    ],
  },
  {
    key: "superdosagem",
    patterns: [/^SUPERDOSE$/i, /^SUPERDOSAGEM$/i, /^O QUE FAZER SE ALGU(?:É|E)M USAR/i],
  },
  {
    key: "farmacocinetica",
    patterns: [/^FARMACOCIN(?:É|E)TICA$/i],
  },
  {
    key: "classes",
    patterns: [
      /^CLASSE(?:S)? TERAP(?:Ê|E)UTICA(?:S)?$/i,
      /^CLASSE(?:S)? FARMACOL(?:Ó|O)GICA(?:S)?$/i,
      /^FARMACODIN(?:Â|A)MICA$/i,
    ],
  },
  {
    key: "composicao",
    patterns: [/^COMPOSI(?:Ç|C)(?:Ã|A)O$/i, /^COMPOSI(?:Ç|C)(?:Ã|A)O QUALI?-?QUANTITATIVA$/i],
  },
  {
    key: "apresentacoes",
    patterns: [/^APRESENTA(?:Ç|C)(?:Õ|O)ES?$/i, /^FORMA(?:S)? FARMAC(?:Ê|E)UTICA(?:S)?$/i],
  },
  {
    key: "armazenamento",
    patterns: [
      /^ARMAZENAMENTO$/i,
      /^CONSERVA(?:Ç|C)(?:Ã|A)O$/i,
      /^COMO DEVO GUARDAR ESTE MEDICAMENTO\??$/i,
    ],
  },
  {
    key: "dizeresLegais",
    patterns: [
      /^DIZERES LEGAIS$/i,
      /^INFORMA(?:Ç|C)(?:Õ|O)ES? AO PACIENTE$/i,
      /^IDENTIFICA(?:Ç|C)(?:Ã|A)O DO MEDICAMENTO$/i,
    ],
  },
]

function normalizeHeading(line: string) {
  return line
    .trim()
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/[:\-–—]\s*$/, "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function cleanText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

export function dedupeParagraphs(text: string): string {
  const paragraphs = cleanText(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const unique: string[] = []
  for (const p of paragraphs) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(p)
  }
  return unique.join("\n\n")
}

function stripHtml(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  )
}

function matchSectionKey(heading: string): keyof ParsedBulaSections | null {
  const normalized = normalizeHeading(heading)
  for (const alias of SECTION_ALIASES) {
    if (alias.patterns.some((p) => p.test(normalized))) return alias.key
  }
  return null
}

export function parsePosologiaSubsections(rawPosologia: string): BulaPosologia {
  const text = dedupeParagraphs(rawPosologia)
  return { texto_completo: text }
}

export function parseBulaText(raw: string): ParsedBulaSections {
  const text = stripHtml(raw)
  const lines = text.split("\n")
  const sections: ParsedBulaSections = {}
  let currentKey: keyof ParsedBulaSections | null = null
  const buffers: Partial<Record<keyof ParsedBulaSections, string[]>> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (currentKey) (buffers[currentKey] ??= []).push("")
      continue
    }

    const sectionKey = matchSectionKey(trimmed)
    if (sectionKey) {
      currentKey = sectionKey
      buffers[currentKey] ??= []
      continue
    }

    if (currentKey) (buffers[currentKey] ??= []).push(trimmed)
  }

  for (const [key, parts] of Object.entries(buffers) as Array<[keyof ParsedBulaSections, string[]]>) {
    const content = dedupeParagraphs(parts.join("\n"))
    if (content) sections[key] = content
  }

  const farmacoBlock = text.match(
    /FARMACOCIN(?:É|E)TICA[\s\S]*?(?=\n\s*(?:FARMACODIN(?:Â|A)MICA|COMPOSI(?:Ç|C)(?:Ã|A)O|CONTRAINDICA|$))/i
  )
  if (farmacoBlock && !sections.farmacocinetica) {
    sections.farmacocinetica = dedupeParagraphs(
      farmacoBlock[0].replace(/^FARMACOCIN(?:É|E)TICA\s*/i, "")
    )
  }

  const interacoesBlock = text.match(
    /INTERA(?:Ç|C)(?:Õ|O)ES? MEDICAMENTOSAS?[\s\S]*?(?=\n\s*(?:SUPERDOSE|POSOLOGIA|REA(?:Ç|C)(?:Õ|O)ES? ADVERSAS|$))/i
  )
  if (interacoesBlock && !sections.interacoes) {
    sections.interacoes = dedupeParagraphs(
      interacoesBlock[0].replace(/^INTERA(?:Ç|C)(?:Õ|O)ES? MEDICAMENTOSAS?\s*/i, "")
    )
  }

  const apresentacoesBlock = text.match(
    /APRESENTA(?:Ç|C)(?:Õ|O)ES?[\s\S]*?(?=\n\s*(?:ARMAZENAMENTO|CONSERVA(?:Ç|C)(?:Ã|A)O|DIZERES LEGAIS|$))/i
  )
  if (apresentacoesBlock && !sections.apresentacoes) {
    sections.apresentacoes = dedupeParagraphs(
      apresentacoesBlock[0].replace(/^APRESENTA(?:Ç|C)(?:Õ|O)ES?\s*/i, "")
    )
  }

  return sections
}

export function parsedToBulaSecoes(parsed: ParsedBulaSections): BulaSecoes {
  const secoes: BulaSecoes = {}

  if (parsed.indicacao) secoes.indicacao = parsed.indicacao
  if (parsed.farmacocinetica) secoes.farmacocinetica = parsed.farmacocinetica
  if (parsed.contraindicacoes) secoes.contraindicacoes = parsed.contraindicacoes
  if (parsed.posologia) secoes.posologia = parsePosologiaSubsections(parsed.posologia)
  if (parsed.efeitosColaterais) secoes.efeitos_colaterais = parsed.efeitosColaterais
  if (parsed.advertencias) secoes.advertencias_precaucoes = parsed.advertencias
  if (parsed.interacoes) secoes.interacoes_medicamentosas = parsed.interacoes
  if (parsed.superdosagem) secoes.superdosagem = parsed.superdosagem
  if (parsed.composicao) secoes.composicao = parsed.composicao
  if (parsed.apresentacoes) secoes.apresentacoes = parsed.apresentacoes
  if (parsed.armazenamento) secoes.armazenamento = parsed.armazenamento
  if (parsed.dizeresLegais) secoes.dizeres_legais = parsed.dizeresLegais

  return secoes
}

export function splitClasses(raw?: string): string[] {
  if (!raw?.trim()) return []
  return [
    ...new Set(
      raw
        .split(/[;\n,|/]+/)
        .map((c) => c.replace(/^CLASSE(?:S)?\s*(?:TERAP(?:Ê|E)UTICA|FARMACOL(?:Ó|O)GICA)?[:\s]*/i, "").trim())
        .filter(Boolean)
    ),
  ]
}

const LABORATORY_HINT =
  /fabricad|embalad|registrad|importad|distribu[ií]d|cnpj|\bcep\b|avenida|rodovia|estrada|ind[uú]stria|basil[eé]ia|su[ií][çc]a|jap[aã]o|por [A-Z]/i

const LEGAL_HINT =
  /reg\.?\s*ms|ms[-\s.\d]|crf|farm\.?\s*resp|farmac[eê]utico respons|0800|www\.|lote|validade|servi[cç]o gratuito|vide cartucho|n[ºo°]\s*do lote/i

export function splitDizeresLegais(text: string): {
  informacoesLegais?: string
  laboratorio?: string
} {
  const paragraphs = dedupeParagraphs(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const legal: string[] = []
  const lab: string[] = []

  for (const p of paragraphs) {
    const isLab = LABORATORY_HINT.test(p)
    const isLegal = LEGAL_HINT.test(p)

    if (isLab && !isLegal) lab.push(p)
    else if (isLegal && !isLab) legal.push(p)
    else if (isLab && isLegal) {
      if (/fabricad|embalad|registrad|importad|distribu[ií]d|cnpj/i.test(p)) lab.push(p)
      else legal.push(p)
    } else if (p.length > 120 && /ltd|s\.?a\.?/i.test(p)) lab.push(p)
    else legal.push(p)
  }

  return {
    informacoesLegais: legal.length ? legal.join("\n\n") : undefined,
    laboratorio: lab.length ? lab.join("\n\n") : undefined,
  }
}

export function countFilledSections(secoes: BulaSecoes): number {
  let count = 0
  for (const value of Object.values(secoes)) {
    if (!value) continue
    if (typeof value === "string" && value.trim()) count++
    else if (typeof value === "object") {
      const pos = value as BulaPosologia
      if (Object.values(pos).some((v) => v?.trim())) count++
    }
  }
  return count
}

export const BULA_SECTION_LABELS: Record<string, string> = {
  indicacao: "Indicação",
  farmacocinetica: "Farmacocinética",
  contraindicacoes: "Contraindicações",
  posologia: "Posologia",
  efeitos_colaterais: "Efeitos colaterais",
  advertencias_precaucoes: "Advertências e precauções",
  interacoes_medicamentosas: "Interações medicamentosas",
  superdosagem: "Superdosagem",
  composicao: "Composição",
  apresentacoes: "Apresentações",
  armazenamento: "Armazenamento",
  dizeres_legais: "Dizeres legais",
}

export const POSOLOGIA_SUB_LABELS: Record<keyof BulaPosologia, string> = {
  texto_completo: "Posologia (texto completo)",
  creme: "Creme",
  solucao_dermatologica: "Solução dermatológica",
  comprimido: "Comprimido / Cápsula",
  gotas: "Gotas",
  xarope: "Xarope",
  injetavel: "Injetável",
  supositorio: "Supositório",
  casos_especiais: "Casos especiais",
}
