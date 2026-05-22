import { PrismaClient } from "@prisma/client"

export async function seedCidInss(prisma: PrismaClient) {
  const count = await prisma.cidInss.count()
  if (count > 0) return

  await prisma.cidInss.createMany({
    data: [
      {
        codigo: "B20",
        temCarencia: true,
        fonteCarencia: "INSS",
        temIrpf: true,
        fonteIrpf: "INSS",
        temNtep: false,
        versao: "sample",
      },
    ],
  })

  console.log("  CID INSS: 1 registro de amostra (B20)")
}
