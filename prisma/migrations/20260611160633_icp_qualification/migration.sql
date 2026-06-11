-- CreateEnum
CREATE TYPE "IcpStatus" AS ENUM ('UNKNOWN', 'QUALIFIED', 'REVIEW', 'DISQUALIFIED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "icpCategory" TEXT,
ADD COLUMN     "icpReason" TEXT,
ADD COLUMN     "icpScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icpStatus" "IcpStatus" NOT NULL DEFAULT 'UNKNOWN';

-- CreateIndex
CREATE INDEX "Company_icpStatus_idx" ON "Company"("icpStatus");
