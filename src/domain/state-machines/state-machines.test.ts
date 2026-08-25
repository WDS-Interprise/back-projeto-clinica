import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ENCOUNTER_TRANSITIONS,
  assertEncounterCanAddendum,
  assertEncounterCanEdit,
  assertEncounterTransition,
  encounterCompleteIsIdempotent,
  isEncounterEditable,
} from "./encounter.js"
import { APPOINTMENT_TRANSITIONS, assertAppointmentStatusTransition } from "./appointment.js"
import {
  PRESCRIPTION_TRANSITIONS,
  assertPrescriptionEditable,
  prescriptionFinalizeIsIdempotent,
} from "./prescription.js"
import {
  SIGNATURE_TRANSITIONS,
  assertCanMarkSigned,
  canMarkCryptographicallySigned,
} from "./prescription-signature.js"
import { DomainError } from "../../lib/domain-error.js"

describe("maquina de estados Encounter", () => {
  it("permite IN_PROGRESS -> COMPLETED e IN_PROGRESS -> CANCELLED", () => {
    assert.deepEqual(ENCOUNTER_TRANSITIONS.IN_PROGRESS, ["COMPLETED", "CANCELLED"])
    assertEncounterTransition("IN_PROGRESS", "COMPLETED")
    assertEncounterTransition("IN_PROGRESS", "CANCELLED")
  })

  it("rejeita COMPLETED -> IN_PROGRESS", () => {
    assert.throws(() => assertEncounterTransition("COMPLETED", "IN_PROGRESS"), DomainError)
  })

  it("completa repetido e idempotente", () => {
    assert.equal(encounterCompleteIsIdempotent("COMPLETED"), true)
    assertEncounterTransition("COMPLETED", "COMPLETED")
  })

  it("bloqueia edicao apos COMPLETED e permite adendo", () => {
    assert.equal(isEncounterEditable("COMPLETED"), false)
    assert.throws(() => assertEncounterCanEdit("COMPLETED"), DomainError)
    assertEncounterCanAddendum("COMPLETED")
    assert.throws(() => assertEncounterCanAddendum("IN_PROGRESS"), DomainError)
  })

  it("CANCELLED e terminal", () => {
    assert.deepEqual(ENCOUNTER_TRANSITIONS.CANCELLED, [])
    assert.throws(() => assertEncounterTransition("CANCELLED", "IN_PROGRESS"), DomainError)
  })
})

describe("maquina de estados Appointment", () => {
  it("nao permite COMPLETED -> IN_PROGRESS", () => {
    assert.throws(
      () => assertAppointmentStatusTransition({ from: "COMPLETED", to: "IN_PROGRESS" }),
      DomainError
    )
  })

  it("permite IN_PROGRESS -> CANCELLED", () => {
    assert.ok(APPOINTMENT_TRANSITIONS.IN_PROGRESS.includes("CANCELLED"))
    assertAppointmentStatusTransition({ from: "IN_PROGRESS", to: "CANCELLED" })
  })

  it("bloqueio de agenda nao vira atendimento", () => {
    assert.throws(
      () =>
        assertAppointmentStatusTransition({
          from: "SCHEDULED",
          to: "IN_PROGRESS",
          type: "BLOCK",
        }),
      DomainError
    )
  })
})

describe("maquina de estados Prescription", () => {
  it("DRAFT -> FINALIZED e nao volta", () => {
    assert.ok(PRESCRIPTION_TRANSITIONS.DRAFT.includes("FINALIZED"))
    assert.equal(PRESCRIPTION_TRANSITIONS.FINALIZED.includes("DRAFT"), false)
    assert.equal(prescriptionFinalizeIsIdempotent("FINALIZED"), true)
    assert.throws(() => assertPrescriptionEditable("FINALIZED"), DomainError)
  })
})

describe("maquina de estados Signature", () => {
  it("STUB nunca pode ser SIGNED criptografico", () => {
    assert.equal(
      canMarkCryptographicallySigned({ provider: "STUB", isCryptographic: false, documentHash: "abc" }),
      false
    )
    assert.throws(
      () =>
        assertCanMarkSigned({
          provider: "STUB",
          isCryptographic: true,
          documentHash: "abc",
        }),
      DomainError
    )
  })

  it("SIGNED exige provider real, hash e flag criptografica", () => {
    assert.equal(
      canMarkCryptographicallySigned({
        provider: "LOCAL_CERTIFICATE",
        isCryptographic: true,
        documentHash: "deadbeef",
      }),
      true
    )
    assert.ok(SIGNATURE_TRANSITIONS.PROCESSING.includes("SIGNED"))
    assert.equal(SIGNATURE_TRANSITIONS.SIMULATED.includes("SIGNED"), false)
  })
})
