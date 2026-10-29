import { Module } from '@nestjs/common';
import { ProgramsController } from './programs.controller';
import { SchedulesController } from './schedules.controller';

@Module({
  controllers: [ProgramsController, SchedulesController],
})
export class ProgramsModule {}
