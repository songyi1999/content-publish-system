import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginDto, LoginResult } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyPassword } from '../../common/password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { role: true },
    });
    if (!user || !user.enabled || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const role = user.role?.name ?? 'none';
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role });
    return { accessToken, username: user.username, role };
  }
}
