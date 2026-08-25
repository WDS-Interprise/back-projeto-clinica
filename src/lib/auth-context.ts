import type { FastifyRequest } from "fastify"
import prisma from "@/lib/prisma.js"
import { getPermissionsForRole } from "@/lib/permissions.js"
import { resolveUserPermissions } from "@/lib/clinic-roles.js"
import type { AuthContext, JwtPayload } from "@/types/index.js"

type RequestWithUser = FastifyRequest & { user: JwtPayload }

export function jwtFromRequest(req: FastifyRequest): JwtPayload {
  return (req as RequestWithUser).user
}

export async function ctxFromRequest(req: FastifyRequest): Promise<AuthContext> {
  const payload = jwtFromRequest(req)
  return buildAuthContext(payload.userId, payload.clinicId)
}

export async function buildAuthContext(userId: string, clinicId?: string): Promise<AuthContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: { select: { id: true } },
      linkedDoctors: { select: { doctorId: true } },
    },
  })

  if (!user) throw new Error("USER_NOT_FOUND")

  let resolvedClinicId = clinicId
  if (!resolvedClinicId || resolvedClinicId === "none") {
    const link = await prisma.userClinic.findFirst({
      where: { userId, active: true },
      select: { clinicId: true },
    })
    resolvedClinicId = link?.clinicId ?? ""
  } else {
    const membership = await prisma.userClinic.findFirst({
      where: { userId, clinicId: resolvedClinicId, active: true },
      select: { clinicId: true },
    })
    if (!membership) {
      throw new Error("CLINIC_NOT_ALLOWED")
    }
  }

  const hasClinicalProfile = Boolean(user.doctorProfile?.id)
  const permissions = resolvedClinicId
    ? await resolveUserPermissions(user.id, resolvedClinicId, user.role, hasClinicalProfile)
    : getPermissionsForRole(user.role, { hasClinicalProfile })
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    clinicId: resolvedClinicId,
    doctorId: user.doctorProfile?.id,
    hasClinicalProfile,
    permissions,
    linkedDoctorIds:
      user.role === "RECEPTION"
        ? user.linkedDoctors.map((l) => l.doctorId)
        : undefined,
  }
}

export function appointmentDoctorFilter(ctx: AuthContext): { doctorId?: string | { in: string[] } } {
  if (ctx.role === "DOCTOR" && ctx.doctorId) {
    return { doctorId: ctx.doctorId }
  }
  return {}
}

/** Paciente visível na agenda: permissão geral, gestão da agenda ou consulta do próprio médico. */
export function canViewAppointmentPatient(
  ctx: AuthContext,
  apt: { doctorId?: string | null }
): boolean {
  if (ctx.permissions?.includes("patients:view")) return true
  if (ctx.permissions?.includes("agenda:manage")) return true
  if (ctx.role === "DOCTOR" && ctx.doctorId && apt.doctorId === ctx.doctorId) return true
  return false
}
