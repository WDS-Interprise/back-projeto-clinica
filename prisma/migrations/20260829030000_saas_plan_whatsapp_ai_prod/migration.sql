-- Prod parcial (era db push): cria Plan/SaaS + cols WhatsApp AI faltantes.
-- Idempotente. Nao apaga dados. Seguro apos migrate resolve --rolled-back.

-- Enums SaaS
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'REFUNDED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Plan
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "monthlyPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "annualPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "limitsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_slug_key" ON "Plan"("slug");
CREATE INDEX IF NOT EXISTS "Plan_active_public_displayOrder_idx" ON "Plan"("active", "public", "displayOrder");

-- ClinicSubscription
CREATE TABLE IF NOT EXISTS "ClinicSubscription" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "courtesyUntil" TIMESTAMP(3),
    "asaasCustomerId" TEXT,
    "asaasSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicSubscription_clinicId_key" ON "ClinicSubscription"("clinicId");
CREATE INDEX IF NOT EXISTS "ClinicSubscription_planId_status_idx" ON "ClinicSubscription"("planId", "status");
CREATE INDEX IF NOT EXISTS "ClinicSubscription_status_idx" ON "ClinicSubscription"("status");

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."ClinicSubscription"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClinicSubscription_clinicId_fkey') THEN
    ALTER TABLE "ClinicSubscription"
      ADD CONSTRAINT "ClinicSubscription_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF to_regclass('public."Plan"') IS NOT NULL
     AND to_regclass('public."ClinicSubscription"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClinicSubscription_planId_fkey') THEN
    ALTER TABLE "ClinicSubscription"
      ADD CONSTRAINT "ClinicSubscription_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- SubscriptionInvoice
CREATE TABLE IF NOT EXISTS "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "clinicSubscriptionId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "asaasPaymentId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "billingType" TEXT NOT NULL DEFAULT 'PIX',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionInvoice_asaasPaymentId_key" ON "SubscriptionInvoice"("asaasPaymentId");
CREATE INDEX IF NOT EXISTS "SubscriptionInvoice_clinicId_status_idx" ON "SubscriptionInvoice"("clinicId", "status");
CREATE INDEX IF NOT EXISTS "SubscriptionInvoice_clinicSubscriptionId_dueDate_idx" ON "SubscriptionInvoice"("clinicSubscriptionId", "dueDate");

DO $$
BEGIN
  IF to_regclass('public."ClinicSubscription"') IS NOT NULL
     AND to_regclass('public."SubscriptionInvoice"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionInvoice_clinicSubscriptionId_fkey') THEN
    ALTER TABLE "SubscriptionInvoice"
      ADD CONSTRAINT "SubscriptionInvoice_clinicSubscriptionId_fkey"
      FOREIGN KEY ("clinicSubscriptionId") REFERENCES "ClinicSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."SubscriptionInvoice"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionInvoice_clinicId_fkey') THEN
    ALTER TABLE "SubscriptionInvoice"
      ADD CONSTRAINT "SubscriptionInvoice_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ClinicUsagePeriod
CREATE TABLE IF NOT EXISTS "ClinicUsagePeriod" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "aiMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "aiActionsCount" INTEGER NOT NULL DEFAULT 0,
    "storageUsedMb" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicUsagePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicUsagePeriod_clinicId_periodKey_key" ON "ClinicUsagePeriod"("clinicId", "periodKey");
CREATE INDEX IF NOT EXISTS "ClinicUsagePeriod_clinicId_idx" ON "ClinicUsagePeriod"("clinicId");

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."ClinicUsagePeriod"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClinicUsagePeriod_clinicId_fkey') THEN
    ALTER TABLE "ClinicUsagePeriod"
      ADD CONSTRAINT "ClinicUsagePeriod_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- PlatformSettings / Outbox / Idempotency (tambem em 20260829021000; IF NOT EXISTS aqui cobre baseline parcial)
CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id" TEXT NOT NULL,
    "defaultPlanId" TEXT,
    "defaultTrialDays" INTEGER NOT NULL DEFAULT 14,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "billingEmail" TEXT,
    "newSignupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_clinicId_aggregateType_aggregateId_idx" ON "OutboxEvent"("clinicId", "aggregateType", "aggregateId");

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."OutboxEvent"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OutboxEvent_clinicId_fkey') THEN
    ALTER TABLE "OutboxEvent"
      ADD CONSTRAINT "OutboxEvent_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_actorUserId_operation_key_key"
  ON "IdempotencyRecord"("clinicId", "actorUserId", "operation", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_createdAt_idx" ON "IdempotencyRecord"("clinicId", "createdAt");

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."IdempotencyRecord"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IdempotencyRecord_clinicId_fkey') THEN
    ALTER TABLE "IdempotencyRecord"
      ADD CONSTRAINT "IdempotencyRecord_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- WhatsApp AI columns (migration whatsapp antiga pode ter so aiAssistantEnabled)
DO $$
BEGIN
  IF to_regclass('public."ClinicWhatsappSettings"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ClinicWhatsappSettings' AND column_name = 'aiAutoReplyEnabled'
    ) THEN
      ALTER TABLE "ClinicWhatsappSettings" ADD COLUMN "aiAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ClinicWhatsappSettings' AND column_name = 'aiMode'
    ) THEN
      ALTER TABLE "ClinicWhatsappSettings" ADD COLUMN "aiMode" TEXT NOT NULL DEFAULT 'MANUAL';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ClinicWhatsappSettings' AND column_name = 'aiPermissionsJson'
    ) THEN
      ALTER TABLE "ClinicWhatsappSettings" ADD COLUMN "aiPermissionsJson" TEXT NOT NULL DEFAULT '{}';
    END IF;
  END IF;
END $$;
