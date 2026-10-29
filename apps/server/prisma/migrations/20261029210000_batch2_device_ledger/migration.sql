-- 批次二：终端台账字段（DV-02/DV-07 心跳上报型号/内存/剩余存储）
ALTER TABLE "Device" ADD COLUMN "model" TEXT;
ALTER TABLE "Device" ADD COLUMN "memTotalMB" INTEGER;
ALTER TABLE "Device" ADD COLUMN "storageFreeBytes" BIGINT;
