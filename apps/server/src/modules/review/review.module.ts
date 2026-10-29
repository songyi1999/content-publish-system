import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { VlmService } from './vlm.service';
import { ContentsModule } from '../contents/contents.module';

@Module({
  imports: [ContentsModule],
  controllers: [ReviewController],
  providers: [ReviewService, VlmService],
})
export class ReviewModule {}
