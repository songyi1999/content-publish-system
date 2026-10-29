import { Injectable, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginDto, LoginResult } from '@cps/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyPassword } from '../../common/password';
import { AuditService } from '../../common/audit.service';

const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  /** 连续失败锁定（UM-05）：内存计数，重启清零 */
  private readonly fails = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const lock = this.fails.get(dto.username);
    if (lock && lock.until > Date.now()) {
      const left = Math.ceil((lock.until - Date.now()) / 60000);
      throw new HttpException(`失败次数过多，已锁定，请${left}分钟后重试`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { role: true },
    });
    const ok = !!user && user.enabled && verifyPassword(dto.password, user.passwordHash);

    if (!ok) {
      const cur = this.fails.get(dto.username) ?? { count: 0, until: 0 };
      cur.count += 1;
      if (cur.count >= MAX_FAILS) {
        cur.until = Date.now() + LOCK_MS;
        cur.count = 0;
      }
      this.fails.set(dto.username, cur);
      await this.audit.log({ userId: user?.id, action: 'LOGIN_FAIL', targetType: 'user', targetId: user?.id, ip, detail: { username: dto.username } });
      throw new UnauthorizedException('用户名或密码错误');
    }

    this.fails.delete(dto.username);
    await this.audit.log({ userId: user.id, action: 'LOGIN_OK', targetType: 'user', targetId: user.id, ip });
    const role = user.role?.name ?? 'none';
    const accessToken = await this.jwt.signAsync({ sub: user.id, username: user.username, role });
    return { accessToken, username: user.username, role };
  }
}
