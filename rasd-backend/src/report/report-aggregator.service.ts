import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SeoCheckResult, CheckStatus } from '../seo/seo-analyzer.service.js';
import type { UnmeasuredMetric } from './schemas/report.schema.js';
import { buildEvidence, translateEvidenceMessage } from './evidence.js';
import type { Language } from '../common/language.js';

export type IssueSeverity = 'critical' | 'moderate' | 'minor';

export interface AggregatedCheck {
  check: string;
  weight: number;
  failCount: number;
  warningCount: number;
  unknownCount: number;
  passCount: number;
  affectedPageUrls: string[];
  messageCounts: Record<string, number>;
  unmeasured: Record<string, number>;
}

export interface ComputedIssue {
  check: string;
  scope: 'page' | 'site';
  severity: IssueSeverity;
  weight: number;
  affectedPagesCount: number;
  affectedPages: string[];
  unmeasured: UnmeasuredMetric[];
  evidence: string;
}

export interface SiteReportContext {
  siteUrl: string;
  averageScore: number;
  pageCount: number;
  aggregatedChecks: AggregatedCheck[];
  issues: ComputedIssue[];
  verifiedStrengths: string[];
  siteLevelIssues: SeoCheckResult[];
}

const MAX_AFFECTED_URLS = 50;

export function severityFor(check: Pick<AggregatedCheck, 'failCount' | 'weight'>): IssueSeverity {
  if (check.failCount > 0) {
    if (check.weight >= 3) return 'critical';
    return check.weight === 2 ? 'moderate' : 'minor';
  }
  return check.weight >= 2 ? 'moderate' : 'minor';
}

export function evidenceFor(check: AggregatedCheck, lang: Language = 'ar'): string {
  return buildEvidence(check, lang);
}

@Injectable()
export class ReportAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(siteScanId: string, lang: Language = 'ar'): Promise<SiteReportContext> {
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

    const aggregatedChecks = Array.from(checkMap.values()).sort(
      (a, b) => b.weight * (b.failCount + b.warningCount) - a.weight * (a.failCount + a.warningCount),
    );

    const pageIssues: ComputedIssue[] = aggregatedChecks
      .filter((c) => c.failCount + c.warningCount > 0)
      .map((c) => ({
        check: c.check,
        scope: 'page' as const,
        severity: severityFor(c),
        weight: c.weight,
        affectedPagesCount: c.failCount + c.warningCount,
        affectedPages: c.affectedPageUrls,
        unmeasured: Object.entries(c.unmeasured).map(([metric, pages]) => ({
          metric: metric.toUpperCase(),
          pages,
        })),
        evidence: evidenceFor(c, lang),
      }));

    const siteLevelResults =
      ((siteScan.siteLevelResults as unknown as SeoCheckResult[]) ?? []);
    const siteLevelIssues = siteLevelResults.filter((r) => r.status === 'fail' || r.status === 'warning');

    const siteIssues: ComputedIssue[] = siteLevelIssues.map((result) => {
      const weight = result.weight ?? 2;
      return {
        check: result.check,
        scope: 'site' as const,
        severity: severityFor({ failCount: result.status === 'fail' ? 1 : 0, weight }),
        weight,
        affectedPagesCount: siteScan.pageCount,
        affectedPages: [],
        unmeasured: [],
        evidence: translateEvidenceMessage(result.message, lang),
      };
    });

    const severityRank: Record<IssueSeverity, number> = { critical: 0, moderate: 1, minor: 2 };
    const issues = [...pageIssues, ...siteIssues].sort(
      (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.weight - a.weight,
    );

    const verifiedStrengths = aggregatedChecks
      .filter(
        (c) =>
          c.passCount > 0 &&
          c.passCount === c.failCount + c.warningCount + c.unknownCount + c.passCount,
      )
      .sort((a, b) => b.weight - a.weight)
      .map((c) => c.check);

    return {
      siteUrl: siteScan.site.url,
      averageScore: siteScan.averageScore ?? 0,
      pageCount: siteScan.pageCount,
      aggregatedChecks,
      issues,
      verifiedStrengths,
      siteLevelIssues,
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
        unknownCount: 0,
        passCount: 0,
        affectedPageUrls: [],
        messageCounts: {},
        unmeasured: {},
      });
    }

    const entry = map.get(result.check)!;
    this.incrementStatus(entry, result.status);

    const missing = Array.isArray(result.details?.missing) ? (result.details.missing as string[]) : [];
    for (const metric of missing) {
      entry.unmeasured[metric] = (entry.unmeasured[metric] ?? 0) + 1;
    }

    if (result.status === 'fail' || result.status === 'warning') {
      if (entry.affectedPageUrls.length < MAX_AFFECTED_URLS) {
        entry.affectedPageUrls.push(pageUrl);
      }
      entry.messageCounts[result.message] = (entry.messageCounts[result.message] ?? 0) + 1;
    }
  }

  private incrementStatus(entry: AggregatedCheck, status: CheckStatus): void {
    if (status === 'fail') entry.failCount++;
    else if (status === 'warning') entry.warningCount++;
    else if (status === 'unknown') entry.unknownCount++;
    else entry.passCount++;
  }
}
