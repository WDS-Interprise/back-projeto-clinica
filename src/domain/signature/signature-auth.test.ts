import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { StubSignatureProvider } from "./stub-provider.js"
import { classifySignatureLabel } from "./types.js"
import { hashCanonical } from "../hash/sha256.js"
import {
  assertCanWriteRecords,
  assertClinicScoped,
  assertOptimisticLock,
  assertOwnsClinicalResource,
} from "../authorization/clinical.js"
import { DomainError } from "../../lib/domain-error.js"
import type { AuthContext } from "../../types/index.js"

function ctx(partial: Partial<AuthContext>): AuthContext {
  return {
    userId: "user-a",
    email: "a@clinic.test",
    role: "DOCTOR",
    clinicId: "clinic-a",
    doctorId: "doc-a",
    permissions: ["records:write"],
    hasClinicalProfile: true,
    ...partial,
  }
}

describe("assinatura stub", () => {
  it("nunca classifica STUB como ICP-Brasil", async () => {
    const provider = new StubSignatureProvider()
    const result = await provider.createSignature({
      clinicId: "c1",
      prescriptionId: "p1",
      documentHash: hashCanonical({ items: [{ name: "dipirona" }] }),
      requestedByUserId: "u1",
      mode: "STUB",
    })
    assert.equal(result.isCryptographic, false)
    assert.equal(result.status, "SIMULATED")
    assert.equal(result.legalClass, "SIMULATION")
    const label = classifySignatureLabel(result)
    assert.equal(label.isIcpBrasil, false)
    assert.match(label.pdfMeta.toLowerCase(), /nao e assinatura icp-brasil/)
    const validation = await provider.validateSignature({ documentHash: result.documentHash })
    assert.equal(validation.valid, false)
  })
})

describe("autorizacao e tenant", () => {
  it("medico nao edita recurso de outro medico", () => {
    assert.throws(
      () => assertOwnsClinicalResource(ctx({}), { doctorId: "doc-b" }),
      (err: unknown) => err instanceof DomainError && err.code === "DOCTOR_NOT_ALLOWED"
    )
  })

  it("recurso de outra clinica vira 404", () => {
    assert.throws(
      () => assertClinicScoped(ctx({}), "clinic-b"),
      (err: unknown) => err instanceof DomainError && err.httpStatus === 404
    )
  })

  it("recepcionista sem records:write e negada", () => {
    assert.throws(
      () =>
        assertCanWriteRecords(
          ctx({ role: "RECEPTION", doctorId: undefined, permissions: ["agenda:manage"] })
        ),
      DomainError
    )
  })

  it("conflito de versao gera 409", () => {
    assert.throws(
      () => assertOptimisticLock(17, 16),
      (err: unknown) => err instanceof DomainError && err.code === "VERSION_CONFLICT"
    )
    assertOptimisticLock(17, 17)
  })
})

describe("integridade do snapshot", () => {
  it("hash canonico e estavel e detecta alteracao", () => {
    const a = hashCanonical({ items: [{ name: "a", sortOrder: 1 }], notes: null })
    const b = hashCanonical({ notes: null, items: [{ sortOrder: 1, name: "a" }] })
    const c = hashCanonical({ items: [{ name: "b", sortOrder: 1 }], notes: null })
    assert.equal(a, b)
    assert.notEqual(a, c)
  })
})
