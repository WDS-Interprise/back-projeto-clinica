export type Cid10Record = {
  codigo: string
  descricao: string
  capitulo: string
  capituloDesc: string
  grupo: string
  grupoDesc: string
  categoria: string
  categoriaDesc: string
  tipo: string
}

export type Cid11Record = {
  codigo: string
  descricao: string
  bloco: string
  blocoDesc: string
  capitulo: string
  capituloDesc: string
  tipo: string
  cid10Equivalente?: string
}

export type InssDataset = {
  porCodigo: Record<
    string,
    {
      carencia?: { fonte: string }
      irpf?: { fonte: string }
      ntep?: {
        fonte: string
        cnaes: { codigo: string; descricao: string }[]
      }
    }
  >
  totais: { carencia: number; irpf: number; ntep: number }
  versao: string
}

export type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function buildCid10SearchText(record: Cid10Record) {
  return [
    record.codigo,
    record.descricao,
    record.capituloDesc,
    record.grupoDesc,
    record.categoriaDesc,
  ]
    .join(" ")
    .toLowerCase()
}

export function buildCid11SearchText(record: Cid11Record) {
  return [
    record.codigo,
    record.descricao,
    record.capituloDesc,
    record.blocoDesc,
    record.cid10Equivalente ?? "",
  ]
    .join(" ")
    .toLowerCase()
}
