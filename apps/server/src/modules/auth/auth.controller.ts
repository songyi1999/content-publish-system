import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { LoginDto, LoginResult } from '@cps/shared';
import { JwtUser, Public } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResult> {
    return this.auth.login(dto, req.ip);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser): JwtUser {
    return user;
  }
}
