import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DomainCodes, DomainError } from "../lib/domain-error.js"
import { hashIdempotencyRequest } from "../lib/idempotency.js"
import { nextBackoffMs } from "../lib/outbox.js"

describe("idempotencia", () => {
  it("mesmo payload gera o mesmo requestHash", () => {
    const a = hashIdempotencyRequest({ signDigital: true, shareWhatsApp: false })
    const b = hashIdempotencyRequest({ signDigital: true, shareWhatsApp: false })
    assert.equal(a, b)
  })

  it("payload diferente gera hash diferente", () => {
    const a = hashIdempotencyRequest({ signDigital: true })
    const b = hashIdempotencyRequest({ signDigital: false })
    assert.notEqual(a, b)
  })
})

describe("outbox retry", () => {
  it("backoff e finito", () => {
    assert.ok(nextBackoffMs(0) < nextBackoffMs(3))
    assert.equal(nextBackoffMs(9), nextBackoffMs(4))
  })
})

describe("transacao conceitual de completeEncounter", () => {
  it("falha no appointment impede commit logico do conjunto", async () => {
    const ops: string[] = []
    const tx = {
      async completeEncounter() {
        ops.push("encounter")
        throw new DomainError(DomainCodes.INVALID_APPOINTMENT_STATE, "falha no agendamento", 409)
      },
      async audit() {
        ops.push("audit")
      },
    }
    await assert.rejects(() => tx.completeEncounter())
    assert.deepEqual(ops, ["encounter"])
    assert.equal(ops.includes("audit"), false)
  })
})
