import { createHash } from "crypto"
import type { Prisma } from "@prisma/client"
import { DomainError, DomainCodes } from "@/lib/domain-error.js"

export type IdempotencyOperation =
  | "completeEncounter"
  | "finalizePrescription"
  | "sharePrescription"
  | "requestSignature"

type IdempotencyDb = {
  idempotencyRecord: {
    findUnique: (args: unknown) => Promise<{
      requestHash: string
      status: string
      responseJson: string | null
    } | null>
    create: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
  }
}

export function hashIdempotencyRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex")
}

export async function beginIdempotency(
  db: IdempotencyDb,
  input: {
    clinicId: string
    actorUserId: string
    operation: IdempotencyOperation
    key: string
    requestHash: string
  }
): Promise<{ replay: true; responseJson: string | null } | { replay: false }> {
  const existing = await db.idempotencyRecord.findUnique({
    where: {
      clinicId_actorUserId_operation_key: {
        clinicId: input.clinicId,
        actorUserId: input.actorUserId,
        operation: input.operation,
        key: input.key,
      },
    },
  } as never)

  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      throw new DomainError(
        DomainCodes.IDEMPOTENCY_CONFLICT,
        "A mesma chave de idempotencia foi reutilizada com outro payload",
        409
      )
    }
    return { replay: true, responseJson: existing.responseJson }
  }

  await db.idempotencyRecord.create({
    data: {
      clinicId: input.clinicId,
      actorUserId: input.actorUserId,
      operation: input.operation,
      key: input.key,
      requestHash: input.requestHash,
      status: "STARTED",
    },
  } as never)

  return { replay: false }
}

export async function completeIdempotency(
  db: IdempotencyDb,
  input: {
    clinicId: string
    actorUserId: string
    operation: IdempotencyOperation
    key: string
    response: unknown
  }
) {
  await db.idempotencyRecord.update({
    where: {
      clinicId_actorUserId_operation_key: {
        clinicId: input.clinicId,
        actorUserId: input.actorUserId,
        operation: input.operation,
        key: input.key,
      },
    },
    data: {
      status: "COMPLETED",
      responseJson: JSON.stringify(input.response),
    },
  } as never)
}

export type PrismaClientLike = Prisma.TransactionClient
