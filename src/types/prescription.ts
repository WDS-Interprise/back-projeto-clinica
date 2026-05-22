export type PrescriptionItemInput = {
  type: "MEDICATION" | "EXAM" | "VACCINE" | "FREE_TEXT"
  name: string
  presentation?: string
  dosage?: string
  frequency?: string
  duration?: string
  quantity?: string
  instructions?: string
  continuousUse?: boolean
  extraJson?: string
  sortOrder?: number
}

export type CreatePrescriptionInput = {
  patientId: string
  appointmentId?: string
  receiptType?: "SIMPLE" | "SPECIAL"
  prescriptionDate?: string
  showDate?: boolean
  notes?: string
}

export type UpdatePrescriptionInput = Partial<{
  receiptType: "SIMPLE" | "SPECIAL"
  prescriptionDate: string
  showDate: boolean
  notes: string
  appointmentId: string | null
}>

export type FinalizePrescriptionInput = {
  shareWhatsApp?: boolean
  sharePhone?: string
  signDigital?: boolean
}
