/*
  Warnings:

  - You are about to drop the `SheetSource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SyncRun` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "SheetSource";

-- DropTable
DROP TABLE "SyncRun";

-- DropEnum
DROP TYPE "SyncKind";

-- CreateTable
CREATE TABLE "SheetConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Primary sheet',
    "sheetUrl" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sheetName" TEXT,
    "columnMapping" JSONB,
    "credentialsJson" TEXT,
    "serviceAccountEmail" TEXT,
    "autoDailySync" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastImported" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" INTEGER NOT NULL DEFAULT 0,
    "lastFailed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncHistory" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncHistory_connectionId_startedAt_idx" ON "SyncHistory"("connectionId", "startedAt");

-- AddForeignKey
ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SheetConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
