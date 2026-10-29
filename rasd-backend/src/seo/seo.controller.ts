import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SeoService } from './seo.service.js';
import { ScanSiteDto } from './dto/scan-site.dto.js';
import { ViewerService } from '../auth/viewer.service.js';
import { isPublicUrl } from './url-guard.js';

@Controller()
export class SeoController {
  constructor(
    private readonly seoService: SeoService,
    private readonly viewerService: ViewerService,
  ) {}

  @Post('scan')
  @HttpCode(202)
  async scan(@Body() dto: ScanSiteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await isPublicUrl(dto.url))) {
      throw new BadRequestException({ message: 'This URL is not publicly reachable.', code: 'URL_NOT_PUBLIC' });
    }

    const viewer = await this.viewerService.resolve(req);
    if (!viewer.userId) {
      viewer.guestSessionId = await this.viewerService.ensureGuestSession(req, res);
    }
    return this.seoService.enqueueSiteScan(dto.url, viewer);
  }

  @Get('site-scan/:id/history')
  async history(@Param('id') id: string, @Req() req: Request) {
    return this.seoService.getScoreHistory(id, await this.viewerService.resolve(req));
  }

  @Get('site-scan/:id')
  async getSiteScan(@Param('id') id: string, @Req() req: Request) {
    return this.seoService.getSiteScan(id, await this.viewerService.resolve(req));
  }

  @Get('site-scan')
  async list(@Req() req: Request) {
    return this.seoService.listSiteScans(await this.viewerService.resolve(req));
  }
}
