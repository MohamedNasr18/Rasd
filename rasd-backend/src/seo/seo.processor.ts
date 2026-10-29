import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RendererService } from './renderer.service.js';
import { SeoAnalyzerService } from './seo-analyzer.service.js';
import { SEO_ANALYZER_VERSION } from './analyzer-version.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface ScanJobData {
  url: string;
  siteId: string;
  siteScanId: string;
  type: 'page' | 'site-level';
}

@Processor('seo-analysis', { concurrency: 1 })
export class SeoProcessor extends WorkerHost {
  private readonly logger = new Logger(SeoProcessor.name);

  constructor(
    private readonly renderer: RendererService,
    private readonly analyzer: SeoAnalyzerService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ScanJobData>) {
    const { url, siteId, siteScanId, type } = job.data;

    if (type === 'site-level') {
      return this.processSiteLevelChecks(url, siteScanId);
    }
    return this.processPageScan(url, siteId, siteScanId);
  }

  private async setStage(
    siteScanId: string,
    kind: 'page' | 'site',
    url: string,
    stage: string,
    score?: number,
  ) {
    try {
      await this.prisma.pageProgress.update({
        where: { siteScanId_kind_url: { siteScanId, kind, url } },
        data: score === undefined ? { stage } : { stage, score },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not record stage "${stage}" for ${url}: ${message}`);
    }
  }

  private async processSiteLevelChecks(url: string, siteScanId: string) {
    this.logger.log(`Running site-level checks (robots.txt, sitemap.xml) for ${url}`);
    await this.setStage(siteScanId, 'site', url, 'analyzing');
    try {
      const results = await this.analyzer.analyzeSiteLevel(url);
      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: { siteLevelResults: results as unknown as Prisma.InputJsonValue },
      });
      await this.setStage(siteScanId, 'site', url, 'done');
      return { type: 'site-level', url, score: null, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Site-level checks failed for ${url}: ${message}`);
      await this.setStage(siteScanId, 'site', url, 'failed');
      return { type: 'site-level', url, score: null, error: message };
    }
  }

  private async processPageScan(url: string, siteId: string, siteScanId: string) {
    this.logger.log(`Scanning page ${url} (siteScan ${siteScanId})`);
    await this.setStage(siteScanId, 'page', url, 'rendering');
    try {
      const { html, headers } = await this.renderer.renderPage(url);
      await this.setStage(siteScanId, 'page', url, 'analyzing');
      const { score, results } = await this.analyzer.analyze(html, url, headers, (stage) =>
        this.setStage(siteScanId, 'page', url, stage),
      );

      await this.setStage(siteScanId, 'page', url, 'saving');
      const scan = await this.prisma.scan.create({
        data: {
          siteId,
          siteScanId,
          url,
          score,
          results: results as unknown as Prisma.InputJsonValue,
          analyzerVersion: SEO_ANALYZER_VERSION,
        },
      });

      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: { completedPages: { increment: 1 } },
      });
      await this.setStage(siteScanId, 'page', url, 'done', score);

      return { type: 'page', scanId: scan.id, url, score };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to scan ${url}: ${message}`);
      await this.setStage(siteScanId, 'page', url, 'failed');
      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: { completedPages: { increment: 1 } },
      });
      return { type: 'page', url, score: null, error: message };
    }
  }
}