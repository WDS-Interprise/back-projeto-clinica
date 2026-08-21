import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  COMMERCIAL_PLANS,
  annualEquivalentMonthly,
  formatComparisonValue,
  isCommercialPlanSlug,
} from "./plan-catalog.js"
import { parsePlanLimits, serializePlanLimits, mergeEntitlementLimits } from "./plan-features.js"

describe("catálogo comercial ClinMax", () => {
  it("mantém os preços oficiais", () => {
    const bySlug = Object.fromEntries(COMMERCIAL_PLANS.map((p) => [p.slug, p]))
    assert.equal(bySlug.essencial.monthlyPrice, 99)
    assert.equal(bySlug.essencial.annualPrice, 990)
    assert.equal(bySlug.profissional.monthlyPrice, 199)
    assert.equal(bySlug.profissional.annualPrice, 1990)
    assert.equal(bySlug.premium.monthlyPrice, 349)
    assert.equal(bySlug.premium.annualPrice, 3490)
    assert.equal(bySlug.profissional.highlighted, true)
  })

  it("não usa nomes ou preços antigos da landing", () => {
    const blob = JSON.stringify(COMMERCIAL_PLANS)
    assert.equal(blob.includes("Básico"), false)
    assert.equal(blob.includes("Avançado"), false)
    assert.equal(COMMERCIAL_PLANS.some((p) => p.monthlyPrice === 79), false)
    assert.equal(COMMERCIAL_PLANS.some((p) => p.monthlyPrice === 149), false)
    assert.equal(COMMERCIAL_PLANS.some((p) => p.monthlyPrice === 249), false)
  })

  it("remove ilimitado dos planos comerciais", () => {
    for (const plan of COMMERCIAL_PLANS) {
      for (const value of Object.values(plan.limits)) {
        assert.notEqual(value, null)
      }
    }
    assert.equal(isCommercialPlanSlug("legacy"), false)
  })

  it("não oferece trial gratuito nos planos comerciais", () => {
    for (const plan of COMMERCIAL_PLANS) {
      assert.equal(plan.trialDays, 0)
      assert.equal(plan.ctaLabel.toLowerCase().includes("grátis"), false)
      assert.equal(plan.ctaLabel.toLowerCase().includes("testar"), false)
    }
  })

  it("Profissional inclui ClinMax Pay e IA assistiva, sem WhatsApp IA", () => {
    const pro = COMMERCIAL_PLANS.find((p) => p.slug === "profissional")!
    assert.ok(pro.features.includes("CLINMAX_PAY"))
    assert.ok(pro.features.includes("AI_ASSISTANT"))
    assert.equal(pro.features.includes("WHATSAPP_AI"), false)
    assert.equal(pro.features.includes("TISS"), false)
  })

  it("calcula equivalente mensal do anual", () => {
    assert.equal(annualEquivalentMonthly(990), 82.5)
    assert.equal(annualEquivalentMonthly(1990), 165.83)
    assert.equal(annualEquivalentMonthly(3490), 290.83)
  })

  it("lê limites antigos de IA no JSON", () => {
    const parsed = parsePlanLimits(
      JSON.stringify({ maxUsers: 8, maxAiMessagesPerMonth: 200, maxAiActionsPerMonth: 100 })
    )
    assert.equal(parsed.maxAiAssistantMessagesPerMonth, 200)
    assert.equal(parsed.maxAiAutomationActionsPerMonth, 100)
    const roundtrip = JSON.parse(serializePlanLimits(parsed)) as Record<string, number>
    assert.equal(roundtrip.maxAiMessagesPerMonth, 200)
  })

  it("soma add-ons ao limite base", () => {
    const merged = mergeEntitlementLimits({ maxDoctors: 5, maxWhatsappConnections: 1 }, { maxDoctors: 7, maxWhatsappConnections: 2 })
    assert.equal(merged.maxDoctors, 12)
    assert.equal(merged.maxWhatsappConnections, 3)
  })

  it("compara recursos com o entitlement real", () => {
    const essencial = COMMERCIAL_PLANS[0]
    const whatsapp = formatComparisonValue({
      kind: "feature",
      feature: "WHATSAPP",
      features: essencial.features,
      limits: essencial.limits,
    })
    assert.equal(whatsapp.included, false)
    const agenda = formatComparisonValue({
      kind: "feature",
      feature: "AGENDA",
      features: essencial.features,
      limits: essencial.limits,
    })
    assert.equal(agenda.included, true)
  })
})
