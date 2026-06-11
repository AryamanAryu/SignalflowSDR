-- CreateEnum
CREATE TYPE "StakeholderChangeType" AS ENUM ('NEW_EMPLOYEE', 'PROMOTION', 'TITLE_CHANGE', 'NEW_DECISION_MAKER');

-- CreateEnum
CREATE TYPE "ReEngagementSignalType" AS ENUM ('NEW_STAKEHOLDER', 'STAKEHOLDER_PROMOTED', 'HEADCOUNT_GROWTH');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "description" TEXT,
ADD COLUMN     "headquarters" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "apolloContactId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "seniority" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "StakeholderChangeType" NOT NULL,
    "detail" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReEngagementAlert" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "signalType" "ReEngagementSignalType" NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" JSONB,
    "suggestedContactId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReEngagementAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_apolloContactId_key" ON "Contact"("apolloContactId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "StakeholderChange_companyId_detectedAt_idx" ON "StakeholderChange"("companyId", "detectedAt");

-- CreateIndex
CREATE INDEX "ReEngagementAlert_companyId_idx" ON "ReEngagementAlert"("companyId");

-- CreateIndex
CREATE INDEX "ReEngagementAlert_resolved_createdAt_idx" ON "ReEngagementAlert"("resolved", "createdAt");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderChange" ADD CONSTRAINT "StakeholderChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderChange" ADD CONSTRAINT "StakeholderChange_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReEngagementAlert" ADD CONSTRAINT "ReEngagementAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReEngagementAlert" ADD CONSTRAINT "ReEngagementAlert_suggestedContactId_fkey" FOREIGN KEY ("suggestedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
