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
  if (doctor.hasOwnAgenda === false) return false
  if (!doctor.userId) return false

  const name = doctor.name.trim()
  const specialty = doctor.specialty.trim()

  if (name.length < 4 || specialty.length < 3) return false
  if (TEST_NAME_PATTERN.test(name)) return false
  if (/^[A-Z0-9]{4,12}$/.test(name.replace(/\s/g, ""))) return false

  const letters = name.replace(/[^a-zA-ZÀ-ú]/gi, "")
  if (letters.length < 3) return false

  const vowels = (letters.match(/[aeiouàâéêíóôúü]/gi) ?? []).length
  if (letters.length >= 6 && vowels / letters.length < 0.12) return false

  if (!/[a-zA-ZÀ-ú]/.test(name)) return false

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
    especialidade: doctor.specialty.trim(),
  }
}
