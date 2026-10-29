import { Module } from '@nestjs/common';
import { DeviceApiController } from './device-api.controller';
import { PublishModule } from '../publish/publish.module';

@Module({
  imports: [PublishModule],
  controllers: [DeviceApiController],
})
export class DeviceApiModule {}
