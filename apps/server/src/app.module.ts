import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/auth.guard';
import { RolesGuard } from './common/roles.decorator';
import { AuditService, AuditModule } from './common/audit.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { LogsModule } from './modules/logs/logs.module';
import { StorageModule } from './modules/storage/storage.module';
import { DevicesModule } from './modules/devices/devices.module';
import { ColumnsModule } from './modules/columns/columns.module';
import { MediaModule } from './modules/media/media.module';
import { ContentsModule } from './modules/contents/contents.module';
import { PublishModule } from './modules/publish/publish.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { ReviewModule } from './modules/review/review.module';
import { DeviceApiModule } from './modules/device-api/device-api.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '12h' },
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    LogsModule,
    StorageModule,
    DevicesModule,
    ColumnsModule,
    MediaModule,
    ContentsModule,
    PublishModule,
    ProgramsModule,
    ReviewModule,
    DeviceApiModule,
    SystemModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
