import { PrismaClient } from "@prisma/client"
import { buildCid11SearchText, type Cid11Record } from "../src/lib/cid-types.js"

const SAMPLE: Cid11Record[] = [
  {
    codigo: "1A00",
    descricao: "Cólera",
    bloco: "BlockL1-1A0",
    blocoDesc: "Infecções intestinais bacterianas",
    capitulo: "01",
    capituloDesc: "Algumas doenças infecciosas ou parasitárias",
    tipo: "categoria",
    cid10Equivalente: "A00",
  },
  {
    codigo: "CA23",
    descricao: "Asma",
    bloco: "BlockL2-CA2",
    blocoDesc: "Doenças das vias aéreas",
    capitulo: "12",
    capituloDesc: "Doenças do aparelho respiratório",
    tipo: "categoria",
    cid10Equivalente: "J45",
  },
  {
    codigo: "DA41",
    descricao: "Gastrite",
    bloco: "BlockL2-DA4",
    blocoDesc: "Doenças do estômago",
    capitulo: "13",
    capituloDesc: "Doenças do aparelho digestivo",
    tipo: "categoria",
    cid10Equivalente: "K29",
  },
  {
    codigo: "6B00",
    descricao: "Transtorno de ansiedade generalizada",
    bloco: "BlockL1-6B0",
    blocoDesc: "Transtornos de ansiedade ou medo",
    capitulo: "06",
    capituloDesc: "Transtornos mentais, comportamentais ou do neurodesenvolvimento",
    tipo: "categoria",
    cid10Equivalente: "F41",
  },
]

export async function seedCid11(prisma: PrismaClient) {
  const count = await prisma.cid11.count()
  if (count > 0) return

  await prisma.cid11.createMany({
    data: SAMPLE.map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      bloco: r.bloco,
      blocoDesc: r.blocoDesc,
      capitulo: r.capitulo,
      capituloDesc: r.capituloDesc,
      tipo: r.tipo,
      cid10Equivalente: r.cid10Equivalente ?? null,
      searchText: buildCid11SearchText(r),
    })),
  })

  console.log(`  CID-11: ${SAMPLE.length} códigos de amostra`)
}
