export type Permission =
  | "dashboard:view"
  | "agenda:view"
  | "agenda:manage"
  | "agenda:print"
  | "waiting_list:manage"
  | "agenda_notes:manage"
  | "patients:view"
  | "patients:create"
  | "patients:edit_basic"
  | "patients:edit_clinical"
  | "records:view"
  | "records:write"
  | "prescriptions:write"
  | "clinical_tools:view"
  | "audit:view"
  | "users:manage"
  | "clinics:manage"
  | "invites:manage"
  | "whatsapp:send"
  | "finance:operational"
  | "finance:view"
  | "finance:manage"
  | "reports:view"

const CLINICAL_PERMISSIONS: Permission[] = [
  "patients:edit_clinical",
  "records:view",
  "records:write",
  "prescriptions:write",
  "clinical_tools:view",
]

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: [
    "dashboard:view",
    "agenda:view",
    "agenda:manage",
    "agenda:print",
    "waiting_list:manage",
    "agenda_notes:manage",
    "patients:view",
    "patients:create",
    "patients:edit_basic",
    "users:manage",
    "clinics:manage",
    "invites:manage",
    "whatsapp:send",
    "finance:operational",
    "finance:view",
    "finance:manage",
    "reports:view",
    "audit:view",
  ],
  DOCTOR: [
    "agenda:view",
    "agenda:manage",
    "agenda:print",
    "patients:view",
    "patients:create",
    "patients:edit_basic",
    "patients:edit_clinical",
    "records:view",
    "records:write",
    "prescriptions:write",
    "clinical_tools:view",
  ],
  RECEPTION: [
    "agenda:view",
    "agenda:manage",
    "agenda:print",
    "waiting_list:manage",
    "agenda_notes:manage",
    "patients:view",
    "patients:create",
    "patients:edit_basic",
    "whatsapp:send",
    "finance:operational",
  ],
  CONSULTANT: [
    "dashboard:view",
    "agenda:view",
    "clinics:manage",
    "reports:view",
  ],
  FINANCE: [
    "patients:view",
    "finance:operational",
    "finance:view",
    "finance:manage",
    "reports:view",
  ],
}

export function getPermissionsForRole(
  role: string,
  extras?: { hasClinicalProfile?: boolean }
): Permission[] {
  const base = [...(ROLE_PERMISSIONS[role] ?? [])]
  if (role === "ADMIN" && extras?.hasClinicalProfile) {
    for (const perm of CLINICAL_PERMISSIONS) {
      if (!base.includes(perm)) base.push(perm)
    }
  }
  return base
}

export function hasPermission(
  role: string,
  permission: Permission,
  extras?: { hasClinicalProfile?: boolean }
): boolean {
  return getPermissionsForRole(role, extras).includes(permission)
}

export function getRedirectPath(role: string, _provisionedByClinic = false): string {
  if (role === "FINANCE") return "/gestao/financas"
  if (role === "DOCTOR" || role === "RECEPTION") return "/agenda"
  return "/dashboard"
}
