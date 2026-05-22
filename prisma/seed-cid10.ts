import { PrismaClient } from "@prisma/client"
import { buildCid10SearchText, type Cid10Record } from "../src/lib/cid-types.js"

const SAMPLE: Cid10Record[] = [
  {
    codigo: "I10",
    descricao: "Hipertensão essencial (primária)",
    capitulo: "IX",
    capituloDesc: "Doenças do aparelho circulatório",
    grupo: "I10-I15",
    grupoDesc: "Doenças hipertensivas",
    categoria: "I10",
    categoriaDesc: "Hipertensão essencial (primária)",
    tipo: "categoria",
  },
  {
    codigo: "J45",
    descricao: "Asma",
    capitulo: "X",
    capituloDesc: "Doenças do aparelho respiratório",
    grupo: "J40-J47",
    grupoDesc: "Doenças crônicas das vias aéreas inferiores",
    categoria: "J45",
    categoriaDesc: "Asma",
    tipo: "categoria",
  },
  {
    codigo: "K29",
    descricao: "Gastrite e duodenite",
    capitulo: "XI",
    capituloDesc: "Doenças do aparelho digestivo",
    grupo: "K20-K31",
    grupoDesc: "Doenças do esôfago, estômago e duodeno",
    categoria: "K29",
    categoriaDesc: "Gastrite e duodenite",
    tipo: "categoria",
  },
  {
    codigo: "F41",
    descricao: "Outros transtornos ansiosos",
    capitulo: "V",
    capituloDesc: "Transtornos mentais e comportamentais",
    grupo: "F40-F48",
    grupoDesc: "Transtornos neuróticos, relacionados com o stress e somatoformes",
    categoria: "F41",
    categoriaDesc: "Outros transtornos ansiosos",
    tipo: "categoria",
  },
  {
    codigo: "B20",
    descricao: "Doença pelo vírus da imunodeficiência humana [HIV]",
    capitulo: "I",
    capituloDesc: "Algumas doenças infecciosas e parasitárias",
    grupo: "B20-B24",
    grupoDesc: "Doença pelo vírus da imunodeficiência humana [HIV]",
    categoria: "B20",
    categoriaDesc: "Doença pelo vírus da imunodeficiência humana [HIV]",
    tipo: "categoria",
  },
  {
    codigo: "A00.1",
    descricao: "Cólera devida a Vibrio cholerae 01, biotipo eltor",
    capitulo: "I",
    capituloDesc: "Algumas doenças infecciosas e parasitárias",
    grupo: "A00-A09",
    grupoDesc: "Doenças infecciosas intestinais",
    categoria: "A00",
    categoriaDesc: "Cólera",
    tipo: "subcategoria",
  },
]

export async function seedCid10(prisma: PrismaClient) {
  const count = await prisma.cid10.count()
  if (count > 0) return

  await prisma.cid10.createMany({
    data: SAMPLE.map((r) => ({
      codigo: r.codigo,
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

  console.log(`  CID-10: ${SAMPLE.length} códigos de amostra`)
}

if (process.argv[1]?.replace(/\\/g, "/").includes("seed-cid10")) {
  const prisma = new PrismaClient()
  seedCid10(prisma)
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
