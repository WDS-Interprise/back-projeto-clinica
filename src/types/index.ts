export interface JwtPayload {
  userId: string
  email: string
  role: string
  clinicId?: string
  isPlatformOwner?: boolean
}

export interface AuthContext {
  userId: string
  email: string
  role: string
  clinicId: string
  doctorId?: string
  linkedDoctorIds?: string[]
}
