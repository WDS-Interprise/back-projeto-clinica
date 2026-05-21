import prisma from "@/lib/prisma.js"

export async function list() {
  return prisma.clinic.findMany({ orderBy: { name: "asc" } })
}

export async function getById(id: string) {
  return prisma.clinic.findUnique({ where: { id } })
}

export async function create(data: {
  name: string
  phone?: string
  email?: string
  active?: boolean
}) {
  return prisma.clinic.create({
    data: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      active: data.active ?? true,
    },
  })
}

export async function update(
  id: string,
  data: Partial<{ name: string; phone: string; email: string; active: boolean }>
) {
  return prisma.clinic.update({ where: { id }, data })
}

export async function remove(id: string) {
  await prisma.clinic.delete({ where: { id } })
}
