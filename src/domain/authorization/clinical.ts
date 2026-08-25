import { DomainError, DomainCodes } from "@/lib/domain-error.js"
import type { AuthContext } from "@/types/index.js"

export function assertClinicScoped(
  ctx: AuthContext,
  resourceClinicId: string | null | undefined
) {
  if (!resourceClinicId || resourceClinicId !== ctx.clinicId) {
    throw new DomainError(DomainCodes.NOT_FOUND, "Recurso nao encontrado", 404)
  }
}

export function assertAuthenticatedClinic(ctx: AuthContext) {
  if (!ctx.clinicId || ctx.clinicId === "none") {
    throw new DomainError(DomainCodes.CLINIC_NOT_ALLOWED, "Clinica nao autorizada para este usuario", 403)
  }
}

export function assertHasPermission(ctx: AuthContext, permission: string) {
  if (!ctx.permissions.includes(permission)) {
    throw new DomainError(DomainCodes.PERMISSION_DENIED, "Permissao negada", 403)
  }
}

export function assertCanWriteRecords(ctx: AuthContext) {
  assertHasPermission(ctx, "records:write")
}

export function assertCanWritePrescription(ctx: AuthContext) {
  if (!ctx.permissions.includes("prescriptions:write") && !ctx.permissions.includes("records:write")) {
    throw new DomainError(DomainCodes.PERMISSION_DENIED, "Permissao negada", 403)
  }
}

export function assertCanViewAudit(ctx: AuthContext) {
  if (!ctx.permissions.includes("audit:view") && !ctx.permissions.includes("users:manage")) {
    throw new DomainError(DomainCodes.PERMISSION_DENIED, "Permissao negada", 403)
  }
}

/**
 * Medico so opera sobre recursos do proprio perfil profissional.
 * Admin com perfil clinico e demais papeis com permissao seguem a clinica.
 */
export function assertOwnsClinicalResource(
  ctx: AuthContext,
  resource: { doctorId?: string | null; professionalId?: string | null }
) {
  if (ctx.role !== "DOCTOR" || !ctx.doctorId) return
  if (resource.doctorId && resource.doctorId !== ctx.doctorId) {
    throw new DomainError(DomainCodes.DOCTOR_NOT_ALLOWED, "Profissional nao permitido", 403)
  }
  if (resource.professionalId && resource.professionalId !== ctx.userId) {
    throw new DomainError(DomainCodes.DOCTOR_NOT_ALLOWED, "Profissional nao permitido", 403)
  }
}

export function assertOptimisticLock(currentVersion: number, expectedVersion?: number) {
  if (expectedVersion === undefined || expectedVersion === null) return
  if (currentVersion !== expectedVersion) {
    throw new DomainError(
      DomainCodes.VERSION_CONFLICT,
      "O atendimento foi alterado em outra sessao. Recarregue e tente novamente",
      409
    )
  }
}
