export type VacinaProduto = {
  id: string
  nome: string
  displayName: string
  via: string
  formasDosagens: string[]
  rxcuis: string[]
  fonte: "RxTerms / ClinicalTables"
}

export type VacinaSearchResponse = {
  query: string
  total: number
  items: VacinaProduto[]
  source: "rxterms" | "cache" | "fallback"
}
