import type { Prisma } from "@prisma/client"
import { JWT_SECRET } from "@/lib/env.js"
import { sanitizeAuditMetadata } from "@/domain/audit/sanitize.js"
import { computeAuditEventHash } from "@/domain/audit/hash-chain.js"

export type AuditWriteInput = {
  clinicId?: string
  userId?: string
  actorRole?: string | null
  module: string
  action: string
  entityType?: string
  entityId?: string
  description: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  requestId?: string | null
  required?: boolean
}

function chainSecret() {
  return process.env.AUDIT_CHAIN_SECRET?.trim() || JWT_SECRET
}

export async function writeAuditLogInTx(
  tx: { auditLog: { findFirst: Function; create: Function } },
  input: AuditWriteInput
) {
  const metadata = sanitizeAuditMetadata(input.metadata ?? null)
  const clinicId = input.clinicId ?? null
  const occurredAt = new Date()
  let prevHash: string | null = null
  if (clinicId) {
    const last = await tx.auditLog.findFirst({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      select: { eventHash: true },
    })
    prevHash = last?.eventHash ?? null
  }
  const eventHash = computeAuditEventHash(chainSecret(), {
    prevHash,
    clinicId: clinicId ?? "none",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.userId,
    occurredAt: occurredAt.toISOString(),
  })

  await tx.auditLog.create({
    data: {
      clinicId,
      userId: input.userId,
      actorRole: input.actorRole ?? null,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      description: input.description,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId ?? null,
      prevHash,
      eventHash,
      createdAt: occurredAt,
    },
  })
}

export async function writeAuditLog(input: AuditWriteInput) {
  const prisma = (await import("@/lib/prisma.js")).default
  try {
    await writeAuditLogInTx(prisma, input)
  } catch (err) {
    if (input.required) throw err
  }
}

export type PrismaTx = Prisma.TransactionClient
