import { Injectable, NotFoundException } from '@nestjs/common';
import { FlowProducer } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteCrawlerService } from './site-crawler.service.js';

const SCORE_HISTORY_LIMIT = 30;

// Sites are not deduplicated yet (a new Site row is created per scan) and URLs
// differ by protocol / www / trailing slash, so history is matched on this key.
function normaliseSiteUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

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
      data: {
        siteId: site.id,
        pageCount: pages.length,
        status: 'processing',
        progress: {
          create: [
            { kind: 'site', position: -1, url },
            ...pages.map((pageUrl, position) => ({ kind: 'page', position, url: pageUrl })),
          ],
        },
      },
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
  const siteScan = await this.prisma.siteScan.findUnique({
    where: { id: siteScanId },
    // Ascending so the frontend can take the last row per URL as the latest
    // result (agent rescans included).
    include: {
      scans: { orderBy: { createdAt: 'asc' } },
      progress: { orderBy: { position: 'asc' } },
    },
  });
  if (!siteScan) throw new NotFoundException('Site scan not found.');
  return siteScan;
}

  async listSiteScans() {
  return this.prisma.siteScan.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, status: true, averageScore: true, pageCount: true,
      completedPages: true, reportStatus: true, createdAt: true,
      site: { select: { id: true, url: true } },
    },
  });
}

  async getScoreHistory(siteScanId: string) {
    const siteScan = await this.prisma.siteScan.findUnique({
      where: { id: siteScanId },
      include: { site: { select: { url: true } } },
    });
    if (!siteScan) throw new NotFoundException('Site scan not found.');

    const key = normaliseSiteUrl(siteScan.site.url);
    const sites = await this.prisma.site.findMany({ select: { id: true, url: true } });
    const siteIds = sites.filter((s) => normaliseSiteUrl(s.url) === key).map((s) => s.id);

    const scans = await this.prisma.siteScan.findMany({
      where: {
        siteId: { in: siteIds },
        status: 'completed',
        averageScore: { not: null },
        // A completed scan with zero pages is an empty crawl (score 0), not a
        // real measurement — it would show up as a fake dip in the trend.
        pageCount: { gt: 0 },
      },
      orderBy: { createdAt: 'desc' },
      take: SCORE_HISTORY_LIMIT,
      select: { id: true, createdAt: true, averageScore: true, pageCount: true },
    });

    return {
      url: siteScan.site.url,
      points: scans
        .filter((s): s is typeof s & { averageScore: number } => s.averageScore !== null)
        .reverse()
        .map((s) => ({
          siteScanId: s.id,
          createdAt: s.createdAt,
          averageScore: s.averageScore,
          pageCount: s.pageCount,
        })),
    };
  }
}