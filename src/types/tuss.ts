export type TussTerm = {
  tussCode: string
  name: string
}

export type TussSearchResponse = {
  query: string
  total: number
  items: TussTerm[]
  source: "brasilapi" | "cache" | "fallback"
}
