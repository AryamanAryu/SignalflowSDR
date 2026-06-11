-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('FUNDING', 'HIRING', 'HEADCOUNT_GROWTH', 'PRODUCT_LAUNCH', 'EXPANSION', 'LEADERSHIP_CHANGE', 'PARTNERSHIP');

-- CreateEnum
CREATE TYPE "IntentLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "intentLevel" "IntentLevel" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "intentScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastScannedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "signalType" "SignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalScore" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeCount" INTEGER,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "CompanySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_companyId_resolved_idx" ON "Signal"("companyId", "resolved");

-- CreateIndex
CREATE INDEX "Signal_signalType_idx" ON "Signal"("signalType");

-- CreateIndex
CREATE INDEX "Signal_detectedAt_idx" ON "Signal"("detectedAt");

-- CreateIndex
CREATE INDEX "CompanySnapshot_companyId_capturedAt_idx" ON "CompanySnapshot"("companyId", "capturedAt");

-- CreateIndex
CREATE INDEX "Company_intentScore_idx" ON "Company"("intentScore");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySnapshot" ADD CONSTRAINT "CompanySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
