import prisma from "@/lib/prisma.js"

export async function writeAuditLog(input: {
  clinicId?: string
  userId?: string
  module: string
  action: string
  description: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        clinicId: input.clinicId,
        userId: input.userId,
        module: input.module,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        description: input.description,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    })
  } catch {
    // auditoria não deve quebrar fluxo principal
  }
}
