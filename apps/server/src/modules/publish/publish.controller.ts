import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublishService } from './publish.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('publish-tasks')
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  @Post()
  @Roles('admin', 'auditor', 'publisher')
  create(
    @Body() body: { contentId: string; targetType: 'ALL' | 'GROUP' | 'DEVICE'; targetIds?: string[]; mode?: 'now' | 'scheduled'; startAt?: string },
    @CurrentUser() me: JwtUser,
  ) {
    return this.publish.createTask(body, me.sub);
  }

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.publish.listTasks({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
    });
  }

  @Post(':id/revoke')
  @Roles('admin', 'auditor', 'publisher')
  revoke(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    return this.publish.revokeTask(id, me.sub);
  }
}
