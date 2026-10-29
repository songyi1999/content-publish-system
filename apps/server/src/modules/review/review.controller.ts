import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewService } from './review.service';
import { ContentsService } from '../contents/contents.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('review')
export class ReviewController {
  constructor(
    private readonly review: ReviewService,
    private readonly contents: ContentsService,
    private readonly prisma: PrismaService,
  ) {}

  /** 待复审列表（AI 通过后进入人工队列） */
  @Get('pending')
  async pending(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const take = Math.min(100, Number(pageSize ?? 20));
    const skip = (Math.max(1, Number(page ?? 1)) - 1) * take;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.content.count({ where: { status: 'MANUAL_REVIEW' } }),
      this.prisma.content.findMany({
        where: { status: 'MANUAL_REVIEW' },
        orderBy: { updatedAt: 'asc' },
        skip,
        take,
        include: { column: { select: { name: true } } },
      }),
    ]);
    return { total, items };
  }

  /** 编辑提交后自动触发 AI 初审（也可手动重扫） */
  @Post(':id/ai')
  @Roles('admin', 'editor', 'auditor')
  ai(@Param('id') id: string) {
    return this.review.runAiReview(id);
  }

  @Post(':id/approve')
  @Roles('admin', 'auditor')
  approve(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    return this.contents.transition(id, 'APPROVED', me.sub);
  }

  @Post(':id/reject')
  @Roles('admin', 'auditor')
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() me: JwtUser) {
    if (!body.reason?.trim()) throw new BadRequestException('驳回原因必填（AV-03）');
    return this.contents.transition(id, 'REJECTED', me.sub, body.reason);
  }

  @Get('sensitive-words')
  @Roles('admin', 'auditor')
  words(): string[] {
    return this.review.getSensitiveWords();
  }

  @Post('sensitive-words')
  @Roles('admin', 'auditor')
  setWords(@Body() body: { words: string[] }) {
    this.review.setSensitiveWords(body.words ?? []);
    return { ok: true, count: this.review.getSensitiveWords().length };
  }
}
