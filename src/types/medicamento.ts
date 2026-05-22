export type MedicamentoProduto = {
  id: string
  name: string
  activeIngredient?: string
  pharmaceuticalForm?: string
  presentation?: string
  packageQuantity?: string
  laboratory?: string
  productType?: string
  price?: number | null
  currency?: string
  highlighted?: boolean
  bulapiProductId?: number
}

export type MedicamentoSubstancia = {
  id: string
  name: string
  productCount?: number
  bulapiSubstanceId?: number
}

export type MedicamentoSearchResponse = {
  query: string
  products: MedicamentoProduto[]
  substances: MedicamentoSubstancia[]
  totalProducts: number
  totalSubstances: number
  source: "bulapi" | "cache" | "fallback"
}
