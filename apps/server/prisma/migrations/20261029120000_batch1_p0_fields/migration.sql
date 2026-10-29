-- 批次一 P0：CM-05 标签/置顶、UM-03 创建人、PB-04 发布批次、PD-03 节目模板与区域配置
ALTER TABLE "Content" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Content" ADD COLUMN "topped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Content" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublishTask" ADD COLUMN "batchId" TEXT;
CREATE INDEX "PublishTask_batchId_idx" ON "PublishTask"("batchId");

ALTER TABLE "Program" ADD COLUMN "zones" JSONB;
ALTER TABLE "Program" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
