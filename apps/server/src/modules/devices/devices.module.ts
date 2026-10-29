import { Module } from '@nestjs/common';
import { DevicesController, DeviceGroupsController } from './devices.controller';
import { DevicesGateway } from './devices.gateway';

@Module({
  controllers: [DevicesController, DeviceGroupsController],
  providers: [DevicesGateway],
  exports: [DevicesGateway],
})
export class DevicesModule {}
