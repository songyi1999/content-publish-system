-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
