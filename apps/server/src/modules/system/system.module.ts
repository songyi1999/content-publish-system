import { Module } from '@nestjs/common';
import { StatsController, SystemController } from './system.controller';

@Module({ controllers: [SystemController, StatsController] })
export class SystemModule {}
