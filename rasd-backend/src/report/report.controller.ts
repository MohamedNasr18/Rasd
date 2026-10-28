import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { toLanguage } from '../common/language.js';

@Controller('site-scan/:id/report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(202)
  async generate(@Param('id') id: string, @Query('lang') lang?: string) {
    return this.reportService.enqueueReport(id, toLanguage(lang));
  }

  @Get()
  async get(@Param('id') id: string, @Query('lang') lang?: string) {
    return this.reportService.getReport(id, toLanguage(lang));
  }
}
