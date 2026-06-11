/*
  Warnings:

  - You are about to drop the `Outreach` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NOT_REACHED_OUT', 'REACHED_OUT', 'REPLIED', 'MEETING_BOOKED', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'STAGE_CHANGE', 'FOLLOW_UP', 'MEETING', 'OUTREACH');

-- DropForeignKey
ALTER TABLE "Outreach" DROP CONSTRAINT "Outreach_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Outreach" DROP CONSTRAINT "Outreach_userId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "lastOutreachAt" TIMESTAMP(3),
ADD COLUMN     "meetingAt" TIMESTAMP(3),
ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'NOT_REACHED_OUT',
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sdrOwnerId" TEXT;

-- DropTable
DROP TABLE "Outreach";

-- DropEnum
DROP TYPE "OutreachStatus";

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL,
    "body" TEXT,
    "channel" "OutreachChannel",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_companyId_occurredAt_idx" ON "Activity"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_occurredAt_idx" ON "Activity"("occurredAt");

-- CreateIndex
CREATE INDEX "Company_pipelineStage_idx" ON "Company"("pipelineStage");

-- CreateIndex
CREATE INDEX "Company_sdrOwnerId_idx" ON "Company"("sdrOwnerId");

-- CreateIndex
CREATE INDEX "Company_nextFollowUpAt_idx" ON "Company"("nextFollowUpAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_sdrOwnerId_fkey" FOREIGN KEY ("sdrOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
