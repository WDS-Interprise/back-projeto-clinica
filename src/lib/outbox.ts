import type { Prisma } from "@prisma/client"

export async function enqueueOutbox(
  tx: Prisma.TransactionClient | { outboxEvent: { create: (args: unknown) => Promise<unknown> } },
  input: {
    clinicId: string
    aggregateType: string
    aggregateId: string
    eventType: string
    payload: Record<string, unknown>
  }
) {
  await tx.outboxEvent.create({
    data: {
      clinicId: input.clinicId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payloadJson: JSON.stringify(input.payload),
      status: "PENDING",
      attempts: 0,
      maxAttempts: 8,
      nextAttemptAt: new Date(),
    },
  } as never)
}

export function nextBackoffMs(attempts: number): number {
  const caps = [15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
  return caps[Math.min(attempts, caps.length - 1)]
}
