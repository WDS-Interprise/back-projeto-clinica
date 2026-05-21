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
  | "users:manage"
  | "clinics:manage"
  | "whatsapp:send"

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
    "patients:edit_clinical",
    "records:view",
    "records:write",
    "prescriptions:write",
    "users:manage",
    "clinics:manage",
    "whatsapp:send",
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
    "records:view",
    "whatsapp:send",
  ],
}

export function getPermissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function hasPermission(role: string, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission)
}

/** Recepção criada no painel da clínica → agenda; cadastro/login público → dashboard */
export function getRedirectPath(role: string, provisionedByClinic = false): string {
  if (provisionedByClinic && role === "RECEPTION") {
    return "/agenda"
  }
  return "/dashboard"
}
