import { PrismaClient } from "@prisma/client"
import {
  buildCid10SearchText,
  buildCid11SearchText,
  type Cid10Record,
  type Cid11Record,
  type InssDataset,
} from "../lib/cid-types.js"

const CID10_URL = "https://cid.api.br/cid10.json"
const CID11_URL = "https://cid.api.br/cid11.json"
const INSS_URL = "https://cid.api.br/inss.json"
const BATCH_SIZE = 500

function dedupeByCodigo<T extends { codigo: string }>(records: T[]): T[] {
  const map = new Map<string, T>()
  for (const r of records) {
    map.set(r.codigo.toUpperCase(), r)
  }
  return [...map.values()]
}

async function fetchJson<T>(url: string): Promise<T> {
  console.log(`Baixando ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`)
  return res.json() as Promise<T>
}

async function importCid10(prisma: PrismaClient, records: Cid10Record[]) {
  const unique = dedupeByCodigo(records)
  if (unique.length < records.length) {
    console.log(`  CID-10: ${records.length - unique.length} duplicatas ignoradas`)
  }
  console.log(`Importando ${unique.length} registros CID-10...`)
  await prisma.cid10.deleteMany()

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    await prisma.cid10.createMany({
      data: batch.map((r) => ({
        codigo: r.codigo.toUpperCase(),
        descricao: r.descricao,
        capitulo: r.capitulo,
        capituloDesc: r.capituloDesc,
        grupo: r.grupo,
        grupoDesc: r.grupoDesc,
        categoria: r.categoria,
        categoriaDesc: r.categoriaDesc,
        tipo: r.tipo,
        searchText: buildCid10SearchText(r),
      })),
    })
    process.stdout.write(`  CID-10: ${Math.min(i + BATCH_SIZE, unique.length)}/${unique.length}\r`)
  }
  console.log(`\n  CID-10 concluído: ${unique.length} registros`)
}

async function importCid11(prisma: PrismaClient, records: Cid11Record[]) {
  const unique = dedupeByCodigo(records)
  if (unique.length < records.length) {
    console.log(`  CID-11: ${records.length - unique.length} duplicatas ignoradas`)
  }
  console.log(`Importando ${unique.length} registros CID-11...`)
  await prisma.cid11.deleteMany()

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    await prisma.cid11.createMany({
      data: batch.map((r) => ({
        codigo: r.codigo.toUpperCase(),
        descricao: r.descricao,
        bloco: r.bloco,
        blocoDesc: r.blocoDesc,
        capitulo: r.capitulo,
        capituloDesc: r.capituloDesc,
        tipo: r.tipo,
        cid10Equivalente: r.cid10Equivalente?.toUpperCase() ?? null,
        searchText: buildCid11SearchText(r),
      })),
    })
    process.stdout.write(`  CID-11: ${Math.min(i + BATCH_SIZE, unique.length)}/${unique.length}\r`)
  }
  console.log(`\n  CID-11 concluído: ${unique.length} registros`)
}

async function importInss(prisma: PrismaClient, dataset: InssDataset) {
  const codigos = Object.keys(dataset.porCodigo)
  console.log(`Importando ${codigos.length} registros INSS...`)
  await prisma.cidInss.deleteMany()

  for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
    const batch = codigos.slice(i, i + BATCH_SIZE)
    await prisma.cidInss.createMany({
      data: batch.map((codigo) => {
        const info = dataset.porCodigo[codigo]
        return {
          codigo: codigo.toUpperCase(),
          temCarencia: Boolean(info.carencia),
          fonteCarencia: info.carencia?.fonte ?? null,
          temIrpf: Boolean(info.irpf),
          fonteIrpf: info.irpf?.fonte ?? null,
          temNtep: Boolean(info.ntep),
          fonteNtep: info.ntep?.fonte ?? null,
          cnaesJson: info.ntep?.cnaes ?? undefined,
          versao: dataset.versao,
        }
      }),
    })
  }
  console.log(`  INSS concluído: ${codigos.length} registros (versão ${dataset.versao})`)
}

export async function importCidFromApi(prisma: PrismaClient) {
  const [cid10, cid11, inss] = await Promise.all([
    fetchJson<Cid10Record[]>(CID10_URL),
    fetchJson<Cid11Record[]>(CID11_URL),
    fetchJson<InssDataset>(INSS_URL),
  ])

  await importCid10(prisma, cid10)
  await importCid11(prisma, cid11)
  await importInss(prisma, inss)

  console.log("Importação CID concluída com sucesso.")
}

if (process.argv[1]?.replace(/\\/g, "/").includes("import-cid")) {
  const prisma = new PrismaClient()
  importCidFromApi(prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err)
      prisma.$disconnect().finally(() => process.exit(1))
    })
}
