-- Nucleo clinico: versao, auditoria encadeada, snapshot de prescricacao, outbox e idempotencia.
-- Backward-safe: so ADD COLUMN / CREATE TABLE. Nao apaga dados.

ALTER TABLE "Encounter" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Encounter" ADD COLUMN "signatureMode" TEXT;
ALTER TABLE "Encounter" ADD COLUMN "signatureStatus" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "eventHash" TEXT;

ALTER TABLE "Prescription" ADD COLUMN "snapshotJson" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "contentHash" TEXT;

ALTER TABLE "PrescriptionSignature" ADD COLUMN "clinicId" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "providerTransactionId" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "signatureFormat" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "signaturePolicy" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "algorithm" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "documentHash" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "signedDocumentHash" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "isCryptographic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "legalClass" TEXT NOT NULL DEFAULT 'SIMULATION';
ALTER TABLE "PrescriptionSignature" ADD COLUMN "requestedAt" DATETIME;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "validatedAt" DATETIME;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "failedAt" DATETIME;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "failureCode" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "failureMessage" TEXT;
ALTER TABLE "PrescriptionSignature" ADD COLUMN "updatedAt" DATETIME;

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
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_actorUserId_operation_key_key" ON "IdempotencyRecord"("clinicId", "actorUserId", "operation", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_clinicId_createdAt_idx" ON "IdempotencyRecord"("clinicId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "PrescriptionSignature_clinicId_status_idx" ON "PrescriptionSignature"("clinicId", "status");
