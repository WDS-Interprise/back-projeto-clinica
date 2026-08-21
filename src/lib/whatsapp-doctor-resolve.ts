import prisma from "@/lib/prisma.js"
import { doctorNameMatchesQuery } from "@/lib/doctor-display-filter.js"
import type { ListedDoctor } from "@/lib/whatsapp-ai-context.js"

const clinicDoctorWhere = (clinicId: string) => ({
  available: true,
  userId: { not: null },
  OR: [
    { user: { clinics: { some: { clinicId, active: true } } } },
    { appointments: { some: { clinicId } } },
  ],
})

export function isPersistedDoctorId(id: string | null | undefined): boolean {
  return Boolean(id && /^c[a-z0-9]{20,}$/i.test(id.trim()))
}

function nameHintFromRawId(rawId: string) {
  return rawId
    .replace(/[-_]/g, " ")
    .replace(/\b(dr|dra|doutor|doutora|id|doc|medico|profissional)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function resolveClinicDoctor(params: {
  clinicId: string
  doctorId?: string | null
  nameHint?: string | null
  listedDoctors?: ListedDoctor[] | null
}): Promise<{ id: string; name: string } | null> {
  const rawId = (params.doctorId ?? "").trim()
  const listed = params.listedDoctors ?? []
  const hint = (params.nameHint ?? "").trim() || nameHintFromRawId(rawId)

  if (isPersistedDoctorId(rawId)) {
    const byId = await prisma.doctor.findFirst({
      where: { id: rawId, ...clinicDoctorWhere(params.clinicId) },
      select: { id: true, name: true },
    })
    if (byId) return byId
  }

  const listedHit =
    listed.find((d) => isPersistedDoctorId(d.id) && d.id === rawId) ??
    listed.find((d) => hint && doctorNameMatchesQuery(d.name, hint)) ??
    listed.find((d) => doctorNameMatchesQuery(d.name, nameHintFromRawId(rawId)))

  if (listedHit && isPersistedDoctorId(listedHit.id)) {
    const byListed = await prisma.doctor.findFirst({
      where: { id: listedHit.id, ...clinicDoctorWhere(params.clinicId) },
      select: { id: true, name: true },
    })
    if (byListed) return byListed
  }

  const doctors = await prisma.doctor.findMany({
    where: clinicDoctorWhere(params.clinicId),
    select: { id: true, name: true },
    take: 40,
  })

  if (hint) {
    const named = doctors.find((d) => doctorNameMatchesQuery(d.name, hint))
    if (named) return named
  }
  if (listedHit) {
    const named = doctors.find((d) => doctorNameMatchesQuery(d.name, listedHit.name))
    if (named) return named
  }
  return null
}
