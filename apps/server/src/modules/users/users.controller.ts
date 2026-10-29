import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<
    Array<{ id: string; username: string; displayName: string | null; role: string | null; enabled: boolean }>
  > {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, displayName: true, enabled: true, role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role?.name ?? null,
      enabled: u.enabled,
    }));
  }
}
