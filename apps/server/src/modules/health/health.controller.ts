import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/auth.guard';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @HttpCode(200)
  async check(): Promise<{ status: string; db: 'up' | 'down'; time: string }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', db });
    }
    return { status: 'ok', db, time: new Date().toISOString() };
  }
}
