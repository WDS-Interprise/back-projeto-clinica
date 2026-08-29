-- Nucleo clinico: versao, auditoria encadeada, snapshot de prescricacao, outbox e idempotencia.
-- Backward-safe: ADD COLUMN / CREATE TABLE com guards (DB parcial da era db push pode nao ter Encounter).
-- Nao apaga dados. Seguro re-rodar apos migrate resolve --rolled-back (P3018).

DO $$
BEGIN
  IF to_regclass('public."Encounter"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Encounter' AND column_name = 'version'
    ) THEN
      ALTER TABLE "Encounter" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Encounter' AND column_name = 'signatureMode'
    ) THEN
      ALTER TABLE "Encounter" ADD COLUMN "signatureMode" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Encounter' AND column_name = 'signatureStatus'
    ) THEN
      ALTER TABLE "Encounter" ADD COLUMN "signatureStatus" TEXT;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."AuditLog"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'actorRole'
    ) THEN
      ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'requestId'
    ) THEN
      ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'prevHash'
    ) THEN
      ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'eventHash'
    ) THEN
      ALTER TABLE "AuditLog" ADD COLUMN "eventHash" TEXT;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."Prescription"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Prescription' AND column_name = 'snapshotJson'
    ) THEN
      ALTER TABLE "Prescription" ADD COLUMN "snapshotJson" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Prescription' AND column_name = 'contentHash'
    ) THEN
      ALTER TABLE "Prescription" ADD COLUMN "contentHash" TEXT;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."PrescriptionSignature"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'clinicId'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "clinicId" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'providerTransactionId'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "providerTransactionId" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'signatureFormat'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "signatureFormat" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'signaturePolicy'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "signaturePolicy" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'algorithm'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "algorithm" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'documentHash'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "documentHash" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'signedDocumentHash'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "signedDocumentHash" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'isCryptographic'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "isCryptographic" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'legalClass'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "legalClass" TEXT NOT NULL DEFAULT 'SIMULATION';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'requestedAt'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "requestedAt" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'validatedAt'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "validatedAt" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'failedAt'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "failedAt" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'failureCode'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "failureCode" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'failureMessage'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "failureMessage" TEXT;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PrescriptionSignature' AND column_name = 'updatedAt'
    ) THEN
      ALTER TABLE "PrescriptionSignature" ADD COLUMN "updatedAt" TIMESTAMP(3);
    END IF;
  END IF;
END $$;

-- Outbox / Idempotency tambem em 20260829021000_outbox_platform_settings (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS "OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."OutboxEvent"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'OutboxEvent_clinicId_fkey'
     ) THEN
    ALTER TABLE "OutboxEvent"
      ADD CONSTRAINT "OutboxEvent_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_clinicId_aggregateType_aggregateId_idx" ON "OutboxEvent"("clinicId", "aggregateType", "aggregateId");

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF to_regclass('public."Clinic"') IS NOT NULL
     AND to_regclass('public."IdempotencyRecord"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'IdempotencyRecord_clinicId_fkey'
     ) THEN
    ALTER TABLE "IdempotencyRecord"
      ADD CONSTRAINT "IdempotencyRecord_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_actorUserId_operation_key_key" ON "IdempotencyRecord"("clinicId", "actorUserId", "operation", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_createdAt_idx" ON "IdempotencyRecord"("clinicId", "createdAt");

DO $$
BEGIN
  IF to_regclass('public."AuditLog"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId")';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."PrescriptionSignature"') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "PrescriptionSignature_clinicId_status_idx" ON "PrescriptionSignature"("clinicId", "status")';
  END IF;
END $$;
