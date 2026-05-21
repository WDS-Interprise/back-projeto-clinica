import prisma from "@/lib/prisma.js"
import { resolvePatientWhatsappDigits } from "@/whatsapp/phone.js"

export async function getPatientWhatsappDigits(
  clinicId: string,
  patientId: string
): Promise<string> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId, active: true },
    select: { phone: true, whatsapp: true },
  })
  if (!patient) throw new Error("PATIENT_NOT_FOUND")
  return resolvePatientWhatsappDigits(patient)
}
