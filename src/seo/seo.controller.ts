import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { SeoService } from './seo.service.js';
import { ScanSiteDto } from './dto/scan-site.dto.js';

@Controller()
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Post('scan')
  @HttpCode(202)
  async scan(@Body() dto: ScanSiteDto) {
    return this.seoService.enqueueSiteScan(dto.url);
  }

  @Get('site-scan/:id')
  async getSiteScan(@Param('id') id: string) {
    return this.seoService.getSiteScan(id);
  }
}