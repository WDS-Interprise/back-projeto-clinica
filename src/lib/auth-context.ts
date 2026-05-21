import type { FastifyRequest } from "fastify"
import prisma from "@/lib/prisma.js"
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
  if (!resolvedClinicId) {
    const link = await prisma.userClinic.findFirst({
      where: { userId, active: true },
      select: { clinicId: true },
    })
    resolvedClinicId = link?.clinicId ?? ""
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    clinicId: resolvedClinicId,
    doctorId: user.doctorProfile?.id,
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
  if (ctx.role === "RECEPTION" && ctx.linkedDoctorIds?.length) {
    return { doctorId: { in: ctx.linkedDoctorIds } }
  }
  return {}
}
