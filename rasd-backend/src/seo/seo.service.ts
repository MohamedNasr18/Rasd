import { ForbiddenException, HttpStatus, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { FlowProducer } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteCrawlerService } from './site-crawler.service.js';
import { ViewerService, type Viewer } from '../auth/viewer.service.js';
import { GUEST_RETRY_DEDUPE_MS } from '../auth/auth.constants.js';
import { redisConnection } from '../redis-connection.js';

const SCORE_HISTORY_LIMIT = 30;

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
    connection: redisConnection(),
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly crawler: SiteCrawlerService,
    private readonly viewerService: ViewerService,
  ) {}

  async enqueueSiteScan(url: string, viewer: Viewer) {
    const ownerFilter = viewer.userId
      ? { userId: viewer.userId }
      : viewer.guestSessionId
        ? { guestSessionId: viewer.guestSessionId }
        : null;

    if (ownerFilter) {
      const inFlight = await this.prisma.siteScan.findMany({
        where: { ...ownerFilter, status: 'processing', createdAt: { gt: new Date(Date.now() - GUEST_RETRY_DEDUPE_MS) } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, site: { select: { url: true } } },
      });
      const requestedKey = normaliseSiteUrl(url);
      const duplicate = inFlight.find((scan) => normaliseSiteUrl(scan.site.url) === requestedKey);
      if (duplicate) {
        return { siteScanId: duplicate.id, pagesQueued: 0, deduped: true };
      }
    }

    if (!viewer.userId) {
      if (!viewer.guestSessionId) {
        throw new ForbiddenException({
          code: 'GUEST_SESSION_REQUIRED',
          message: 'Start a guest session before scanning.',
        });
      }
      const previous = await this.prisma.siteScan.findFirst({
        where: {
          guestSessionId: viewer.guestSessionId,
          OR: [{ status: 'processing' }, { status: 'completed', scans: { some: {} } }],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (previous) {
        throw new HttpException(
          {
            code: 'GUEST_SCAN_LIMIT',
            message: 'Guest scans are limited to one. Sign in or create an account to scan again.',
            siteScanId: previous.id,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const site = await this.prisma.site.create({ data: { url } });
    const pages = await this.crawler.discoverPages(url);

    const siteScan = await this.prisma.siteScan.create({
      data: {
        siteId: site.id,
        userId: viewer.userId,
        guestSessionId: viewer.userId ? null : viewer.guestSessionId,
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

  async getSiteScan(siteScanId: string, viewer: Viewer) {
  await this.viewerService.assertCanView(siteScanId, viewer);
  const siteScan = await this.prisma.siteScan.findUnique({
    where: { id: siteScanId },
    include: {
      scans: { orderBy: { createdAt: 'asc' } },
      progress: { orderBy: { position: 'asc' } },
    },
  });
  if (!siteScan) throw new NotFoundException('Site scan not found.');
  const { userId: _userId, guestSessionId: _guestSessionId, ...publicScan } = siteScan;
  return publicScan;
}

  async listSiteScans(viewer: Viewer) {
  const scope = this.viewerService.ownerScope(viewer);
  if (!scope) return [];
  const scans = await this.prisma.siteScan.findMany({
    where: scope,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, status: true, averageScore: true, pageCount: true,
      completedPages: true, reportStatus: true, createdAt: true,
      site: { select: { id: true, url: true } },
      _count: { select: { scans: true } },
    },
  });
  return scans.map(({ _count, ...scan }) => ({ ...scan, successfulPages: _count.scans }));
}

  async getScoreHistory(siteScanId: string, viewer: Viewer) {
    const siteScan = await this.prisma.siteScan.findUnique({
      where: { id: siteScanId },
      include: { site: { select: { url: true } } },
    });
    if (!siteScan || !this.viewerService.canView(siteScan, viewer)) {
      throw new NotFoundException('Site scan not found.');
    }

    const ownerFilter = siteScan.userId
      ? { userId: siteScan.userId }
      : siteScan.guestSessionId
        ? { guestSessionId: siteScan.guestSessionId }
        : { userId: null, guestSessionId: null };

    const key = normaliseSiteUrl(siteScan.site.url);
    const sites = await this.prisma.site.findMany({ select: { id: true, url: true } });
    const siteIds = sites.filter((s) => normaliseSiteUrl(s.url) === key).map((s) => s.id);

    const scans = await this.prisma.siteScan.findMany({
      where: {
        ...ownerFilter,
        siteId: { in: siteIds },
        status: 'completed',
        averageScore: { not: null },
        pageCount: { gt: 0 },
        scans: { some: {} },
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