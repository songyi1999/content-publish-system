import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { AuditService } from '../../common/audit.service';
import { Roles } from '../../common/roles.decorator';
import type { JwtUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Post('upload')
  @Roles('admin', 'editor')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() me: JwtUser) {
    const asset = await this.media.upload(file);
    await this.audit.log({ userId: me.sub, action: 'MEDIA_UPLOAD', targetType: 'media', targetId: (asset as { id: string }).id, detail: { name: file?.originalname } });
    return asset;
  }

  @Post(':id/transcode')
  @Roles('admin', 'editor')
  transcode(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    return this.media.transcode(id);
  }

  @Get()
  list(
    @Query('kind') kind?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.media.list({
      kind,
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Delete(':id')
  @Roles('admin', 'editor')
  async remove(@Param('id') id: string, @CurrentUser() me: JwtUser) {
    const r = await this.media.remove(id);
    if (r.ok) await this.audit.log({ userId: me.sub, action: 'MEDIA_DELETE', targetType: 'media', targetId: id });
    return r;
  }
}
