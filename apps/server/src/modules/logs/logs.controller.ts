import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../../common/audit.service';

interface LogQuery {
  action?: string;
  username?: string;
  from?: string;
  to?: string;
}

@Controller('logs')
export class LogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('username') username?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      action,
      username,
      from,
      to,
    });
  }

  /** CSV 导出（LG-05）：与列表同条件，最多 10000 条 */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async exportCsv(@Query() q: LogQuery, @Res() res: Response) {
    const csv = await this.audit.exportCsv(q);
    res.send(csv);
  }
}
