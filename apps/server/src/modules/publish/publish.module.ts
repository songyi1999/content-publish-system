import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
