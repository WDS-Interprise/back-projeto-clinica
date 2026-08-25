import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sanitizeAuditMetadata } from "./sanitize.js"
import { computeAuditEventHash } from "./hash-chain.js"

describe("auditoria clinica", () => {
  it("nao grava queixa, diagnostico, nome ou CPF em metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      appointmentId: "apt_1",
      cidCode: "J06",
      mainComplaint: "dor de cabeca intensa",
      patientName: "Fulano da Silva",
      cpf: "00000000000",
      notes: "evolucao completa",
    })
    assert.deepEqual(sanitized, { appointmentId: "apt_1", cidCode: "J06" })
  })

  it("hash chain muda se o evento anterior muda", () => {
    const a = computeAuditEventHash("secret", {
      prevHash: "GENESIS",
      clinicId: "c1",
      action: "ENCOUNTER_COMPLETED",
      entityType: "Encounter",
      entityId: "e1",
      actorUserId: "u1",
      occurredAt: "2026-08-24T12:00:00.000Z",
    })
    const b = computeAuditEventHash("secret", {
      prevHash: "TAMPERED",
      clinicId: "c1",
      action: "ENCOUNTER_COMPLETED",
      entityType: "Encounter",
      entityId: "e1",
      actorUserId: "u1",
      occurredAt: "2026-08-24T12:00:00.000Z",
    })
    assert.notEqual(a, b)
    assert.match(a, /^[a-f0-9]{64}$/)
  })
})
