const TEST_NAME_PATTERN = /test|asdasd|sdfsdf|xxx|dummy|fake|lorem|rtesdfs/i

/** Médicos aptos para exibição ao paciente no WhatsApp. */
export function isDoctorVisibleToPatients(doctor: {
  name: string
  specialty: string
  available: boolean
  userId?: string | null
  hasOwnAgenda?: boolean
}): boolean {
  if (!doctor.available) return false
  if (!doctor.userId) return false
  if (!doctor.name.trim()) return false
  if (TEST_NAME_PATTERN.test(doctor.name)) return false
  return true
}

export function formatDoctorForPatientListing(doctor: {
  id: string
  name: string
  specialty: string
}) {
  return {
    id: doctor.id,
    nome: doctor.name.trim(),
    especialidade: doctor.specialty.trim() || "Não informada",
  }
}

export function doctorNameMatchesQuery(name: string, query: string): boolean {
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\b(doutor(?:a)?|dr\.?|dra\.?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!q) return true
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2)
  if (tokens.length === 0) return n.includes(q.replace(/\s/g, ""))
  const expand = (t: string) => {
    if (t === "jr" || t === "junior") return ["jr", "junior", "junio"]
    return [t]
  }
  return tokens.every((t) => expand(t).some((alias) => n.includes(alias)))
}
