import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
  ) {
    return this.audit.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      action,
    });
  }
}
