import prisma from "@/lib/prisma.js"

/** Médico pertence à clínica quando o usuário vinculado é membro ativo dela. */
export function doctorInClinicWhere(clinicId: string) {
  return {
    user: {
      clinics: {
        some: { clinicId, active: true },
      },
    },
  }
}

export async function assertDoctorInClinic(clinicId: string, doctorId: string) {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      ...doctorInClinicWhere(clinicId),
    },
    select: { id: true },
  })
  if (!doctor) {
    throw new Error("DOCTOR_NOT_IN_CLINIC")
  }
}
