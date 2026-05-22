-- CreateTable
CREATE TABLE "BulaCache" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "substanceKey" TEXT NOT NULL,
    "substanceName" TEXT,
    "source" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulaCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulaCache_externalId_key" ON "BulaCache"("externalId");

-- CreateIndex
CREATE INDEX "BulaCache_substanceKey_idx" ON "BulaCache"("substanceKey");

-- CreateIndex
CREATE INDEX "BulaCache_fetchedAt_idx" ON "BulaCache"("fetchedAt");
