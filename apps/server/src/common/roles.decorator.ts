import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtUser } from './auth.guard';

const ROLES_KEY = 'roles';
/** 限定可访问的角色（admin 恒通） */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user as JwtUser | undefined;
    if (!user) return false;
    if (user.role === 'admin' || required.includes(user.role)) return true;
    throw new ForbiddenException('当前角色无权执行该操作');
  }
}
