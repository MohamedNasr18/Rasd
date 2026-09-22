import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ReportService } from './report.service.js';

@Controller('site-scan/:id/report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(202)
  async generate(@Param('id') id: string) {
    return this.reportService.enqueueReport(id);
  }

  @Get()
  async get(@Param('id') id: string) {
    return this.reportService.getReport(id);
  }
}