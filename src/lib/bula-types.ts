export type BulaPosologia = {
  texto_completo?: string
  gotas?: string
  xarope?: string
  injetavel?: string
  supositorio?: string
  creme?: string
  solucao_dermatologica?: string
  comprimido?: string
  casos_especiais?: string
}

export type BulaSecoes = {
  indicacao?: string
  farmacocinetica?: string
  contraindicacoes?: string
  posologia?: BulaPosologia
  efeitos_colaterais?: string
  advertencias_precaucoes?: string
  interacoes_medicamentosas?: string
  superdosagem?: string
  composicao?: string
  apresentacoes?: string
  armazenamento?: string
  dizeres_legais?: string
}

export type BulaDetailPayload = {
  id: string
  nome: string
  classes: string[]
  fonte: string
  registro_ms?: string
  /** MS, farmacêutico responsável, SAC, validade — bloco legal compacto */
  informacoes_legais?: string
  /** Fabricação, importação e distribuição */
  laboratorio?: string
  secoes: BulaSecoes
  url_pdf?: string
  atualizado_em: string
}

export type BulaSummary = {
  id: string
  name: string
  substanceName?: string
  manufacturerName?: string
  regulatoryCategory?: string
  therapeuticClass?: string
  variantCount?: number
}

export type PaginatedBulasResponse = {
  source: "anvisa" | "bulapi"
  items: BulaSummary[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export class BulaFetchError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "UNAVAILABLE" | "INCOMPLETE" = "UNAVAILABLE"
  ) {
    super(message)
    this.name = "BulaFetchError"
  }
}
