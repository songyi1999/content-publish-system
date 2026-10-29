import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import type { ContentStatus } from '@cps/shared';
import { ContentsService } from './contents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('contents')
export class ContentsController {
  constructor(
    private readonly contents: ContentsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @Query('columnId') columnId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() me?: JwtUser,
  ) {
    return this.contents.list({
      columnId,
      status,
      keyword,
      tag,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }, me);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() me?: JwtUser) {
    return this.contents.get(id, me);
  }

  @Post()
  @Roles('admin', 'editor')
  async create(@Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    const r = await this.contents.create(body as never, me.sub);
    await this.audit.log({ userId: me.sub, action: 'CONTENT_CREATE', targetType: 'content', targetId: r.id });
    return r;
  }

  @Put(':id')
  @Roles('admin', 'editor')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() me: JwtUser) {
    const r = await this.contents.update(id, body as never, me);
    await this.audit.log({ userId: me.sub, action: 'CONTENT_UPDATE', targetType: 'content', targetId: id });
    return r;
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const refCount = await this.prisma.publishTask.count({ where: { contentId: id, status: 'DONE' } });
    if (refCount > 0) return { ok: false, message: '内容已在终端发布，请先下架' };
    await this.prisma.content.delete({ where: { id } });
    await this.audit.log({ userId: me.sub, action: 'CONTENT_DELETE', targetType: 'content', targetId: id });
    return { ok: true };
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) {
    return this.contents.versions(id);
  }

  @Post(':id/versions/:vid/restore')
  @Roles('admin', 'editor')
  restore(@Param('id') id: string, @Param('vid') vid: string, @CurrentUser() me: JwtUser) {
    return this.contents.restoreVersion(id, vid, me);
  }

  /** 编辑提交审核（R6：编辑无发布权，submit 之后进入 AI 审核） */
  @Post(':id/submit')
  @Roles('admin', 'editor')
  submit(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    return this.contents.transition(id, 'AI_REVIEW' as ContentStatus, me.sub, undefined, me);
  }
}
