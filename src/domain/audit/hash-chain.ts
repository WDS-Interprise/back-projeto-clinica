import { hmacSha256Hex } from "@/domain/hash/sha256.js"

export type AuditChainInput = {
  prevHash: string | null
  clinicId: string
  action: string
  entityType?: string | null
  entityId?: string | null
  actorUserId?: string | null
  occurredAt: string
}

export function computeAuditEventHash(secret: string, input: AuditChainInput): string {
  const payload = [
    input.prevHash ?? "GENESIS",
    input.clinicId,
    input.action,
    input.entityType ?? "",
    input.entityId ?? "",
    input.actorUserId ?? "",
    input.occurredAt,
  ].join("|")
  return hmacSha256Hex(secret, payload)
}
