import type { AuthContext } from "@/types/index.js"

/** Contexto elevado para ações do assistente IA (sem usuário logado). */
export function systemAuthContext(clinicId: string): AuthContext {
  return {
    userId: "system-ai",
    email: "ai@clinmax.local",
    role: "ADMIN",
    clinicId,
  }
}
