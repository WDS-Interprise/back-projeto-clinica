import prisma from "@/lib/prisma.js"
import { nextBackoffMs } from "@/lib/outbox.js"
import { deliverQueuedPrescriptionShare } from "@/services/prescription.service.js"

export async function processClinicalOutbox(limit = 20) {
  const now = new Date()
  const batch = await prisma.outboxEvent.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })

  for (const event of batch) {
    if (event.attempts >= event.maxAttempts) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", lastError: event.lastError ?? "MAX_ATTEMPTS" },
      })
      continue
    }

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING", attempts: event.attempts + 1 },
    })

    try {
      if (event.eventType === "PRESCRIPTION_SHARE_WHATSAPP") {
        const payload = JSON.parse(event.payloadJson) as { shareId?: string }
        if (!payload.shareId) throw new Error("SHARE_ID_MISSING")
        await deliverQueuedPrescriptionShare(payload.shareId)
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "SENT", processedAt: new Date(), lastError: null },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "OUTBOX_FAILED"
      const attempts = event.attempts + 1
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= event.maxAttempts ? "FAILED" : "PENDING",
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + nextBackoffMs(attempts)),
        },
      })
    }
  }

  return batch.length
}
