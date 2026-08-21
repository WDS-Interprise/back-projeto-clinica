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
  data: Partial<{
    name: string
    phone: string
    email: string
    active: boolean
    agendaStartTime: string
    agendaEndTime: string
    lunchStartTime: string
    lunchEndTime: string
    slotIntervalMinutes: number
    spaceType?: string
    teamSizeLabel?: string
    billingModel?: string
    careMode?: string
    operatingDays?: string
    cnpj?: string | null
    website?: string | null
    notes?: string | null
    logoUrl?: string | null
    logoFileName?: string | null
    documentHeader?: string | null
    addressStreet?: string | null
    addressCity?: string | null
    addressState?: string | null
    addressZip?: string | null
  }>
) {
  return prisma.clinic.update({ where: { id }, data })
}

export async function remove(id: string) {
  await prisma.clinic.delete({ where: { id } })
}
