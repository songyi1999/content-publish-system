import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { ContentsService } from './contents.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'video', 'source', 'figure', 'figcaption']),
  allowedAttributes: { '*': ['style', 'class'], img: ['src', 'alt', 'width', 'height'], video: ['src', 'controls', 'poster'] },
  allowedSchemes: ['http', 'https', 'data'],
};

@Controller('contents/import')
export class ImportController {
  constructor(
    private readonly contents: ContentsService,
    private readonly audit: AuditService,
  ) {}

  /** docx 导入（ED-04）：mammoth 转为富文本，图片以 base64 内联保留 */
  @Post('docx')
  @Roles('admin', 'editor')
  @UseInterceptors(FileInterceptor('file'))
  async importDocx(@UploadedFile() file: Express.Multer.File, @CurrentUser() me: JwtUser) {
    if (!file?.buffer) throw new BadRequestException('文件为空');
    const { value: html } = await mammoth.convertToHtml({ buffer: file.buffer });
    const r = await this.contents.create({
      title: (file.originalname || '未命名文档').replace(/\.docx?$/i, ''),
      type: 'richtext',
      body: { html },
    });
    await this.audit.log({ userId: me.sub, action: 'IMPORT_DOCX', targetType: 'content', targetId: r.id });
    return { ...r, html };
  }

  /** txt 导入（ED-05）：按空行分段映射富文本 */
  @Post('txt')
  @Roles('admin', 'editor')
  @UseInterceptors(FileInterceptor('file'))
  async importTxt(@UploadedFile() file: Express.Multer.File, @CurrentUser() me: JwtUser) {
    if (!file?.buffer) throw new BadRequestException('文件为空');
    const text = file.buffer.toString('utf-8');
    const html = text
      .split(/\n\s*\n/)
      .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`)
      .join('');
    const r = await this.contents.create({
      title: (file.originalname || '未命名文本').replace(/\.txt$/i, ''),
      type: 'richtext',
      body: { html, text },
    });
    await this.audit.log({ userId: me.sub, action: 'IMPORT_TXT', targetType: 'content', targetId: r.id });
    return { ...r, html };
  }

  /** HTML 导入（ED-06）：白名单过滤 + 脚本剥离，防 XSS */
  @Post('html')
  @Roles('admin', 'editor')
  async importHtml(@Body() body: { title?: string; html: string }, @CurrentUser() me: JwtUser) {
    if (!body.html) throw new BadRequestException('html 为空');
    const clean = sanitizeHtml(body.html, SANITIZE_OPTIONS);
    const r = await this.contents.create({
      title: body.title || '导入网页',
      type: 'richtext',
      body: { html: clean },
    });
    await this.audit.log({ userId: me.sub, action: 'IMPORT_HTML', targetType: 'content', targetId: r.id });
    return { ...r, html: clean };
  }
}
