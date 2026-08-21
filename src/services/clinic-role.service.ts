import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type { Permission } from "@/lib/permissions.js"
import {
  ALL_CONFIGURABLE_PERMISSIONS,
  ensureDefaultClinicRoles,
  PERMISSION_GROUPS,
  presentClinicRole,
} from "@/lib/clinic-roles.js"

export { PERMISSION_GROUPS }

export async function listClinicRoles(ctx: AuthContext) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  await ensureDefaultClinicRoles(ctx.clinicId)
  const rows = await prisma.clinicRole.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: true } } },
  })
  return rows.map(presentClinicRole)
}

export async function getClinicRole(ctx: AuthContext, id: string) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const row = await prisma.clinicRole.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: { _count: { select: { members: true } } },
  })
  if (!row) throw new Error("NOT_FOUND")
  return presentClinicRole(row)
}

function sanitizePermissions(perms: string[]): Permission[] {
  return perms.filter((p): p is Permission =>
    ALL_CONFIGURABLE_PERMISSIONS.includes(p as Permission)
  )
}

export async function createClinicRole(
  ctx: AuthContext,
  data: { name: string; permissions: string[] }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const name = data.name.trim()
  if (name.length < 2) throw new Error("INVALID_NAME")
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) +
    "-" +
    Date.now().toString(36)

  const maxOrder = await prisma.clinicRole.aggregate({
    where: { clinicId: ctx.clinicId },
    _max: { sortOrder: true },
  })

  const row = await prisma.clinicRole.create({
    data: {
      clinicId: ctx.clinicId,
      slug,
      name,
      isSystem: false,
      permissionsJson: JSON.stringify(sanitizePermissions(data.permissions)),
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
    },
    include: { _count: { select: { members: true } } },
  })
  return presentClinicRole(row)
}

export async function updateClinicRole(
  ctx: AuthContext,
  id: string,
  data: { name?: string; permissions?: string[] }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const existing = await prisma.clinicRole.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")

  const patch: { name?: string; permissionsJson?: string } = {}
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (name.length < 2) throw new Error("INVALID_NAME")
    patch.name = name
  }
  if (data.permissions !== undefined) {
    patch.permissionsJson = JSON.stringify(sanitizePermissions(data.permissions))
  }

  const row = await prisma.clinicRole.update({
    where: { id },
    data: patch,
    include: { _count: { select: { members: true } } },
  })
  return presentClinicRole(row)
}

export async function deleteClinicRole(ctx: AuthContext, id: string) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  const existing = await prisma.clinicRole.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: { _count: { select: { members: true } } },
  })
  if (!existing) throw new Error("NOT_FOUND")
  if (existing.isSystem) throw new Error("SYSTEM_ROLE")
  if (existing._count.members > 0) throw new Error("ROLE_IN_USE")

  await prisma.clinicRole.delete({ where: { id } })
}
