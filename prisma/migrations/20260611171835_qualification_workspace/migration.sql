-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "icpSignals" TEXT[],
ADD COLUMN     "inCrm" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Company_inCrm_idx" ON "Company"("inCrm");
