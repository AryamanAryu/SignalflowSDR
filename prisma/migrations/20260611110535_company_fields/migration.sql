/*
  Warnings:

  - You are about to drop the column `description` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `headcount` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `Company` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Company_lastEnrichedAt_idx";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "description",
DROP COLUMN "headcount",
DROP COLUMN "location",
DROP COLUMN "website",
ADD COLUMN     "country" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "employeeCount" INTEGER;

-- CreateIndex
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");
