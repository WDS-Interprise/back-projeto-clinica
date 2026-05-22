import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"

export async function listContacts(ctx: AuthContext, params: { search?: string; type?: string }) {
  const search = params.search?.trim()
  const type = params.type?.trim()

  const contacts: Array<{
    id: string
    name: string
    type: string
    phone: string | null
    email: string | null
    subtitle?: string
  }> = []

  if (!type || type === "patient") {
    const patients = await prisma.patient.findMany({
      where: {
        clinicId: ctx.clinicId,
        active: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      take: 50,
      orderBy: { name: "asc" },
    })
    contacts.push(
      ...patients.map((p) => ({
        id: p.id,
        name: p.name,
        type: "patient",
        phone: p.phone,
        email: p.email,
        subtitle: p.insurancePlan,
      }))
    )
  }

  if (!type || type === "professional") {
    const doctors = await prisma.doctor.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : undefined,
      take: 50,
      orderBy: { name: "asc" },
    })
    contacts.push(
      ...doctors.map((d) => ({
        id: d.id,
        name: d.name,
        type: "professional",
        phone: d.phone,
        email: d.email,
        subtitle: d.specialty,
      }))
    )
  }

  if (!type || type === "staff") {
    const links = await prisma.userClinic.findMany({
      where: { clinicId: ctx.clinicId, active: true },
      include: { user: true },
    })
    for (const link of links) {
      const u = link.user
      if (!u.active) continue
      if (search) {
        const s = search.toLowerCase()
        if (
          !u.name.toLowerCase().includes(s) &&
          !u.email.toLowerCase().includes(s) &&
          !(u.phone ?? "").includes(search)
        ) {
          continue
        }
      }
      contacts.push({
        id: u.id,
        name: u.name,
        type: u.role === "RECEPTION" ? "reception" : "staff",
        phone: u.phone,
        email: u.email,
        subtitle: u.role,
      })
    }
  }

  return contacts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}
