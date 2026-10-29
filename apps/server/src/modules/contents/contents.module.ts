import { Module } from '@nestjs/common';
import { ContentsController } from './contents.controller';
import { ContentsService } from './contents.service';
import { ImportController } from './import.controller';

@Module({
  controllers: [ContentsController, ImportController],
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
