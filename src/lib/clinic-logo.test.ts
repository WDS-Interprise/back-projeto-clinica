import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CLINIC_LOGO_MAX_BYTES,
  assertClinicLogoUrl,
  clinicLogoCidAttachment,
  parseClinicLogoDataUrl,
} from "./clinic-logo.js"

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

function dataUrl(mime: string, bytes: Buffer) {
  return `data:${mime};base64,${bytes.toString("base64")}`
}

describe("clinic logo data URL", () => {
  it("aceita PNG JPEG e WebP", () => {
    const png = parseClinicLogoDataUrl(dataUrl("image/png", tinyPng))
    assert.ok(png)
    assert.equal(png.contentType, "image/png")
    assert.equal(png.filename, "clinic-logo.png")
    assert.ok(parseClinicLogoDataUrl(dataUrl("image/jpeg", tinyPng)))
    assert.ok(parseClinicLogoDataUrl(dataUrl("image/webp", tinyPng)))
  })

  it("rejeita SVG, URL http e lixo", () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg></svg>").toString("base64")}`
    assert.equal(parseClinicLogoDataUrl(svg), null)
    assert.equal(parseClinicLogoDataUrl("https://clinica.exemplo/logo.png"), null)
    assert.equal(parseClinicLogoDataUrl("nao-e-data-url"), null)
    assert.equal(parseClinicLogoDataUrl(""), null)
    assert.equal(parseClinicLogoDataUrl(null), null)
  })

  it("rejeita arquivo maior que 400 KB", () => {
    const big = Buffer.alloc(CLINIC_LOGO_MAX_BYTES + 1, 1)
    assert.equal(parseClinicLogoDataUrl(dataUrl("image/png", big)), null)
  })

  it("assert aceita vazio e lanca INVALID_LOGO no invalido", () => {
    assert.doesNotThrow(() => assertClinicLogoUrl(null))
    assert.doesNotThrow(() => assertClinicLogoUrl(""))
    assert.doesNotThrow(() => assertClinicLogoUrl(dataUrl("image/png", tinyPng)))
    try {
      assertClinicLogoUrl("data:image/svg+xml;base64,YQ==")
      assert.fail("deveria lancar")
    } catch (err) {
      assert.equal((err as { code?: string }).code, "INVALID_LOGO")
    }
  })

  it("monta anexo CID ou retorna null", () => {
    const cid = clinicLogoCidAttachment(dataUrl("image/png", tinyPng), "invite-logo@clinmax")
    assert.ok(cid)
    assert.equal(cid.cid, "invite-logo@clinmax")
    assert.ok(Buffer.isBuffer(cid.content))
    assert.equal(clinicLogoCidAttachment("lixo", "x"), null)
  })
})
