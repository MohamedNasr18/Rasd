import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SeoCheckResult, CheckStatus } from '../seo/seo-analyzer.service.js';

export interface AggregatedCheck {
  check: string;
  weight: number;
  failCount: number;
  warningCount: number;
  passCount: number;
  affectedPageUrls: string[];
  sampleMessages: string[];
}

export interface SiteReportContext {
  siteUrl: string;
  averageScore: number;
  pageCount: number;
  aggregatedChecks: AggregatedCheck[];
  siteLevelIssues: SeoCheckResult[];
}

const MAX_SAMPLE_MESSAGES = 3;
const MAX_AFFECTED_URLS = 5;

@Injectable()
export class ReportAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(siteScanId: string): Promise<SiteReportContext> {
    const siteScan = await this.prisma.siteScan.findUniqueOrThrow({
      where: { id: siteScanId },
      include: { scans: true, site: true },
    });

    const checkMap = new Map<string, AggregatedCheck>();

    for (const scan of siteScan.scans) {
      const results = scan.results as unknown as SeoCheckResult[];
      for (const result of results) {
        this.foldIntoAggregate(checkMap, result, scan.url);
      }
    }

    const aggregatedChecks = Array.from(checkMap.values())
      .sort((a, b) => b.weight * (b.failCount + b.warningCount) - a.weight * (a.failCount + a.warningCount));

    return {
      siteUrl: siteScan.site.url,
      averageScore: siteScan.averageScore ?? 0,
      pageCount: siteScan.pageCount,
      aggregatedChecks,
      siteLevelIssues: ((siteScan.siteLevelResults as unknown as SeoCheckResult[]) ?? []).filter(
        (r) => r.status !== 'pass',
      ),
    };
  }

  private foldIntoAggregate(
    map: Map<string, AggregatedCheck>,
    result: SeoCheckResult,
    pageUrl: string,
  ): void {
    if (!map.has(result.check)) {
      map.set(result.check, {
        check: result.check,
        weight: result.weight ?? 1,
        failCount: 0,
        warningCount: 0,
        passCount: 0,
        affectedPageUrls: [],
        sampleMessages: [],
      });
    }

    const entry = map.get(result.check)!;
    this.incrementStatus(entry, result.status);

    if (result.status !== 'pass') {
      if (entry.affectedPageUrls.length < MAX_AFFECTED_URLS) {
        entry.affectedPageUrls.push(pageUrl);
      }
      if (entry.sampleMessages.length < MAX_SAMPLE_MESSAGES) {
        entry.sampleMessages.push(result.message);
      }
    }
  }

  private incrementStatus(entry: AggregatedCheck, status: CheckStatus): void {
    if (status === 'fail') entry.failCount++;
    else if (status === 'warning') entry.warningCount++;
    else entry.passCount++;
  }
}