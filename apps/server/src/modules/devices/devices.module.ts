import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesGateway } from './devices.gateway';

@Module({
  controllers: [DevicesController],
  providers: [DevicesGateway],
  exports: [DevicesGateway],
})
export class DevicesModule {}
