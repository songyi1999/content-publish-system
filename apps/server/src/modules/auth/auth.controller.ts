import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
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
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: JwtUser): JwtUser {
    return user;
  }
}
