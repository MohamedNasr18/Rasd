import { Injectable } from '@nestjs/common';
import { FlowProducer } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteCrawlerService } from './site-crawler.service.js';

@Injectable()
export class SeoService {
  private readonly flowProducer = new FlowProducer({
    connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: SiteCrawlerService,
  ) {}

  async enqueueSiteScan(url: string) {
    const site = await this.prisma.site.create({ data: { url } });
    const pages = await this.crawler.discoverPages(url);

    const siteScan = await this.prisma.siteScan.create({
      data: { siteId: site.id, pageCount: pages.length, status: 'processing' },
    });

    const flow = await this.flowProducer.add({
      name: 'aggregate-site-scan',
      queueName: 'site-aggregation',
      data: { siteScanId: siteScan.id },
      children: [
        {
          name: 'site-level-checks',
          queueName: 'seo-analysis',
          data: { url, siteId: site.id, siteScanId: siteScan.id, type: 'site-level' },
        },
        ...pages.map((pageUrl) => ({
          name: 'scan-page',
          queueName: 'seo-analysis',
          data: { url: pageUrl, siteId: site.id, siteScanId: siteScan.id, type: 'page' },
        })),
      ],
    });

    return { siteScanId: siteScan.id, flowJobId: flow.job.id, pagesQueued: pages.length };
  }

  async getSiteScan(siteScanId: string) {
    return this.prisma.siteScan.findUnique({
      where: { id: siteScanId },
      include: { scans: true },
    });
  }
}