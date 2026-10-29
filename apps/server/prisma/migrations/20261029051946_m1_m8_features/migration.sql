-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "body" JSONB;

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'full',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramItem" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "mediaId" TEXT,
    "durationSec" INTEGER,
    "body" JSONB,

    CONSTRAINT "ProgramItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenshotLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "ahash" TEXT,
    "anomaly" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenshotLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreenshotLog_deviceId_createdAt_idx" ON "ScreenshotLog"("deviceId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenshotLog" ADD CONSTRAINT "ScreenshotLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
