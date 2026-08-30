-- Integridade financeira e billing SaaS.
-- originKey: uma receita de consulta (receipt ou ClinMax Pay).
-- requestedPlanSlug: intencao da landing, separado do plano ativo.
-- defaultTrialDays: alinhado ao catalogo (0). Sem rename destrutivo.

ALTER TABLE "FinancialTransaction" ADD COLUMN IF NOT EXISTS "originKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialTransaction_originKey_key" ON "FinancialTransaction"("originKey");

ALTER TABLE "ClinicSubscription" ADD COLUMN IF NOT EXISTS "requestedPlanSlug" TEXT;

ALTER TABLE "PlatformSettings" ALTER COLUMN "defaultTrialDays" SET DEFAULT 0;
