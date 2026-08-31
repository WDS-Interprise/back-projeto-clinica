import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  COMPANY_LEGAL,
  formatCep,
  formatCnpj,
  formatCompanyAddress,
  formatCompanyCopyright,
  formattedCompanyCnpj,
} from "./company-legal.js"

describe("company legal", () => {
  it("guarda CNPJ e CEP so com digitos", () => {
    assert.equal(COMPANY_LEGAL.cnpj, "50763678000102")
    assert.equal(COMPANY_LEGAL.address.zipCode, "74805480")
    assert.equal(COMPANY_LEGAL.legalName, null)
    assert.equal(COMPANY_LEGAL.dpoName, null)
    assert.equal(COMPANY_LEGAL.venue, null)
  })

  it("formata CNPJ e CEP para exibicao", () => {
    assert.equal(formatCnpj("50763678000102"), "50.763.678/0001-02")
    assert.equal(formattedCompanyCnpj(), "50.763.678/0001-02")
    assert.equal(formatCep("74805480"), "74805-480")
  })

  it("monta endereco publico sem caixa alta de cadastro", () => {
    assert.equal(
      formatCompanyAddress(),
      "Rua 72, nº 223, Jardim Goiás, Goiânia - GO, CEP 74805-480",
    )
  })

  it("omite razao social no copyright enquanto estiver pendente", () => {
    const line = formatCompanyCopyright(2026)
    assert.equal(line, "© 2026 ClinMax. CNPJ 50.763.678/0001-02. Todos os direitos reservados.")
    assert.equal(line.includes("[RAZAO_SOCIAL]"), false)
    assert.equal(line.includes("null"), false)
  })

  it("inclui razao social no copyright quando confirmada", () => {
    const line = formatCompanyCopyright(2026, {
      ...COMPANY_LEGAL,
      legalName: "Empresa Exemplo Ltda",
    })
    assert.equal(
      line,
      "© 2026 ClinMax. Empresa Exemplo Ltda. CNPJ 50.763.678/0001-02. Todos os direitos reservados.",
    )
  })
})
