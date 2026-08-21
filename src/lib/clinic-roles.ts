import prisma from "@/lib/prisma.js"
import { getPermissionsForRole, type Permission } from "@/lib/permissions.js"

export type ClinicRoleDto = {
  id: string
  clinicId: string
  slug: string
  name: string
  isSystem: boolean
  permissions: Permission[]
  sortOrder: number
  memberCount?: number
}

export const SYSTEM_ROLE_DEFS: Array<{
  slug: string
  name: string
  role: string
  sortOrder: number
}> = [
  { slug: "admin", name: "Administrador", role: "ADMIN", sortOrder: 0 },
  { slug: "doctor", name: "Médico", role: "DOCTOR", sortOrder: 1 },
  { slug: "reception", name: "Recepcionista", role: "RECEPTION", sortOrder: 2 },
  { slug: "finance", name: "Financeiro", role: "FINANCE", sortOrder: 3 },
  { slug: "consultant", name: "Consultor", role: "CONSULTANT", sortOrder: 4 },
]

export const PERMISSION_GROUPS: Array<{
  title: string
  items: Array<{ permission: Permission; label: string }>
}> = [
  {
    title: "Agenda",
    items: [
      { permission: "agenda:view", label: "Visualizar agenda" },
      { permission: "agenda:manage", label: "Criar e editar agendamento" },
      { permission: "agenda:print", label: "Imprimir agenda" },
      { permission: "waiting_list:manage", label: "Gerenciar lista de espera" },
      { permission: "agenda_notes:manage", label: "Notas da agenda" },
    ],
  },
  {
    title: "Pacientes",
    items: [
      { permission: "patients:view", label: "Visualizar pacientes" },
      { permission: "patients:create", label: "Criar pacientes" },
      { permission: "patients:edit_basic", label: "Editar dados cadastrais" },
      { permission: "patients:edit_clinical", label: "Editar dados clínicos" },
      { permission: "records:view", label: "Visualizar prontuário" },
      { permission: "records:write", label: "Editar prontuário" },
      { permission: "prescriptions:write", label: "Prescrever" },
      { permission: "clinical_tools:view", label: "Bulas e CID" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { permission: "finance:operational", label: "Registrar pagamento" },
      { permission: "finance:view", label: "Ver faturamento" },
      { permission: "finance:manage", label: "Gerenciar despesas e cadastros" },
      { permission: "reports:view", label: "Ver relatórios" },
    ],
  },
  {
    title: "WhatsApp",
    items: [{ permission: "whatsapp:send", label: "Visualizar conversas e enviar mensagens" }],
  },
  {
    title: "Configurações",
    items: [
      { permission: "dashboard:view", label: "Ver painel" },
      { permission: "clinics:manage", label: "Editar clínica e integrações" },
      { permission: "users:manage", label: "Gerenciar equipe" },
      { permission: "invites:manage", label: "Gerenciar convites" },
    ],
  },
]

export const ALL_CONFIGURABLE_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.permission)
)

function parsePermissionsJson(raw: string): Permission[] {
  try {
    const parsed = JSON.parse(raw) as string[]
    return parsed.filter((p): p is Permission => ALL_CONFIGURABLE_PERMISSIONS.includes(p as Permission))
  } catch {
    return []
  }
}

export function presentClinicRole(row: {
  id: string
  clinicId: string
  slug: string
  name: string
  isSystem: boolean
  permissionsJson: string
  sortOrder: number
  _count?: { members: number }
}): ClinicRoleDto {
  return {
    id: row.id,
    clinicId: row.clinicId,
    slug: row.slug,
    name: row.name,
    isSystem: row.isSystem,
    permissions: parsePermissionsJson(row.permissionsJson),
    sortOrder: row.sortOrder,
    memberCount: row._count?.members,
  }
}

export async function ensureDefaultClinicRoles(clinicId: string) {
  for (const def of SYSTEM_ROLE_DEFS) {
    const permissions = getPermissionsForRole(def.role)
    await prisma.clinicRole.upsert({
      where: { clinicId_slug: { clinicId, slug: def.slug } },
      create: {
        clinicId,
        slug: def.slug,
        name: def.name,
        isSystem: true,
        permissionsJson: JSON.stringify(permissions),
        sortOrder: def.sortOrder,
      },
      update: {},
    })
  }
}

export function roleSlugForUserRole(role: string): string | null {
  const map: Record<string, string> = {
    ADMIN: "admin",
    DOCTOR: "doctor",
    RECEPTION: "reception",
    FINANCE: "finance",
    CONSULTANT: "consultant",
  }
  return map[role] ?? null
}

export async function resolveUserPermissions(
  userId: string,
  clinicId: string,
  role: string,
  hasClinicalProfile: boolean
): Promise<Permission[]> {
  const link = await prisma.userClinic.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    include: { clinicRole: true },
  })

  if (link?.clinicRole?.permissionsJson) {
    const perms = parsePermissionsJson(link.clinicRole.permissionsJson)
    if (perms.length > 0) {
      if (role === "ADMIN" && hasClinicalProfile) {
        const clinical: Permission[] = [
          "patients:edit_clinical",
          "records:view",
          "records:write",
          "prescriptions:write",
          "clinical_tools:view",
        ]
        const merged = [...perms]
        for (const p of clinical) {
          if (!merged.includes(p)) merged.push(p)
        }
        return merged
      }
      return perms
    }
  }

  return getPermissionsForRole(role, { hasClinicalProfile })
}

export async function assignDefaultRoleToUserClinic(userId: string, clinicId: string, role: string) {
  await ensureDefaultClinicRoles(clinicId)
  const slug = roleSlugForUserRole(role)
  if (!slug) return
  const clinicRole = await prisma.clinicRole.findUnique({
    where: { clinicId_slug: { clinicId, slug } },
  })
  if (!clinicRole) return
  await prisma.userClinic.updateMany({
    where: { userId, clinicId },
    data: { clinicRoleId: clinicRole.id },
  })
}
