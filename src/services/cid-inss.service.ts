import prisma from "@/lib/prisma.js"

export async function getInssByCodigo(codigo: string) {
  const item = await prisma.cidInss.findUnique({
    where: { codigo: codigo.toUpperCase() },
  })
  if (!item) return null

  return {
    codigo: item.codigo,
    temCarencia: item.temCarencia,
    fonteCarencia: item.fonteCarencia,
    temIrpf: item.temIrpf,
    fonteIrpf: item.fonteIrpf,
    temNtep: item.temNtep,
    fonteNtep: item.fonteNtep,
    cnaes: item.cnaesJson ?? [],
    versao: item.versao,
  }
}
