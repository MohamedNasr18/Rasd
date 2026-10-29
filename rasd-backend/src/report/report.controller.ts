import { Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReportService } from './report.service.js';
import { toLanguage } from '../common/language.js';
import { ViewerService } from '../auth/viewer.service.js';

@Controller('site-scan/:id/report')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly viewerService: ViewerService,
  ) {}

  @Post()
  @HttpCode(202)
  async generate(@Param('id') id: string, @Req() req: Request, @Query('lang') lang?: string) {
    await this.viewerService.assertCanView(id, await this.viewerService.resolve(req));
    return this.reportService.enqueueReport(id, toLanguage(lang));
  }

  @Get()
  async get(@Param('id') id: string, @Req() req: Request, @Query('lang') lang?: string) {
    await this.viewerService.assertCanView(id, await this.viewerService.resolve(req));
    return this.reportService.getReport(id, toLanguage(lang));
  }
}
