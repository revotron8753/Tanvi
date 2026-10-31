-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MessagePurpose" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "TryOnSource" AS ENUM ('KIOSK', 'WEB');

-- CreateEnum
CREATE TYPE "TryOnSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TryOnJobStatus" AS ENUM ('CREATED', 'VALIDATING', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" "MessagePurpose" NOT NULL DEFAULT 'TRANSACTIONAL',
    "event" TEXT NOT NULL,
    "orderId" UUID,
    "toPhone" TEXT NOT NULL,
    "templateName" TEXT,
    "language" TEXT,
    "variables" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerConsent" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "noticeText" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "tryOnSessionId" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOnSession" (
    "id" UUID NOT NULL,
    "source" "TryOnSource" NOT NULL,
    "deviceId" UUID,
    "tokenHash" TEXT NOT NULL,
    "status" "TryOnSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentId" UUID,
    "inputKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "assetsDeletedAt" TIMESTAMP(3),

    CONSTRAINT "TryOnSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TryOnJob" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "status" "TryOnJobStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "providerJobId" TEXT,
    "resultKey" TEXT,
    "costPaise" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TryOnJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContinuationLink" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContinuationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "OutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_orderId_idx" ON "OutboxMessage"("orderId");

-- CreateIndex
CREATE INDEX "CustomerConsent_purpose_grantedAt_idx" ON "CustomerConsent"("purpose", "grantedAt");

-- CreateIndex
CREATE INDEX "CustomerConsent_tryOnSessionId_idx" ON "CustomerConsent"("tryOnSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "KioskDevice_tokenHash_key" ON "KioskDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TryOnSession_tokenHash_key" ON "TryOnSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TryOnSession_status_expiresAt_idx" ON "TryOnSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TryOnSession_deviceId_idx" ON "TryOnSession"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TryOnJob_idempotencyKey_key" ON "TryOnJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TryOnJob_sessionId_idx" ON "TryOnJob"("sessionId");

-- CreateIndex
CREATE INDEX "TryOnJob_status_createdAt_idx" ON "TryOnJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContinuationLink_tokenHash_key" ON "ContinuationLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ContinuationLink_expiresAt_idx" ON "ContinuationLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerConsent" ADD CONSTRAINT "CustomerConsent_tryOnSessionId_fkey" FOREIGN KEY ("tryOnSessionId") REFERENCES "TryOnSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnSession" ADD CONSTRAINT "TryOnSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "KioskDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnJob" ADD CONSTRAINT "TryOnJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TryOnSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOnJob" ADD CONSTRAINT "TryOnJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuationLink" ADD CONSTRAINT "ContinuationLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TryOnSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_attempts_nonneg" CHECK ("attempts" >= 0);
ALTER TABLE "TryOnJob" ADD CONSTRAINT "TryOnJob_cost_nonneg" CHECK ("costPaise" IS NULL OR "costPaise" >= 0);
