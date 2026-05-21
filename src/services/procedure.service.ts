import prisma from "@/lib/prisma.js"

export async function list(activeOnly = true) {
  return prisma.procedure.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { name: "asc" },
  })
}
