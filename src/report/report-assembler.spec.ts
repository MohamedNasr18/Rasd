import { describe, it, expect } from 'vitest';
import { severityFor, type ComputedIssue, type SiteReportContext } from './report-aggregator.service.js';
import { assembleReport } from './report-generator.service.js';
import type { SeoReportDraft } from './schemas/report.schema.js';

const cwvIssue: ComputedIssue = {
  check: 'core_web_vitals',
  scope: 'page',
  severity: 'critical',
  weight: 3,
  affectedPagesCount: 3,
  affectedPages: ['https://a.com', 'https://a.com/x', 'https://a.com/y'],
  unmeasured: [{ metric: 'INP', pages: 1 }],
  evidence: '3 فشل و0 تحذير من 3 صفحة — LCP 11.2s (field, poor)',
};

const altIssue: ComputedIssue = {
  check: 'image_alt_tags',
  scope: 'page',
  severity: 'minor',
  weight: 1,
  affectedPagesCount: 2,
  affectedPages: ['https://a.com', 'https://a.com/x'],
  unmeasured: [],
  evidence: '2 فشل و0 تحذير من 3 صفحة — 42 of 117 images are missing alt text.',
};

const context: SiteReportContext = {
  siteUrl: 'https://a.com',
  averageScore: 83,
  pageCount: 3,
  aggregatedChecks: [],
  issues: [cwvIssue, altIssue],
  verifiedStrengths: ['https'],
  siteLevelIssues: [],
};

const draft: SeoReportDraft = {
  executiveSummary: 'ملخص',
  overallScoreComment: 'تعليق',
  strengths: [
    { check: 'https', title: 'اتصال آمن', explanation: 'كل الصفحات محمية باتصال HTTPS آمن.' },
    { check: 'mobile_viewport', title: 'متجاوب', explanation: 'الموقع متجاوب.' },
  ],
  priorityIssues: [
    {
      check: 'core_web_vitals',
      explanation: 'زمن LCP مرتفع على الصفحة الرئيسية ويحتاج تحسينًا.',
      recommendation: 'قلل حجم الجافاسكريبت على الصفحة الأولى.',
    },
    {
      check: 'image_alt_tags',
      explanation: 'عدة صور بدون نص بديل على صفحتين من الصفحات.',
      recommendation: 'أضف نصًا بديلًا وصفيًا لكل صورة.',
    },
    { check: 'made_up_check', explanation: 'مشكلة مخترعة.', recommendation: 'حل مخترع.' },
  ],
  quickWins: ['أضف alt', 'حسّن LCP', 'زيادة ثالثة'],
};

describe('severityFor', () => {
  it('derives severity from weight and fail count instead of opinion', () => {
    expect(severityFor({ failCount: 1, weight: 3 })).toBe('critical');
    expect(severityFor({ failCount: 1, weight: 2 })).toBe('moderate');
    expect(severityFor({ failCount: 1, weight: 1 })).toBe('minor');
    expect(severityFor({ failCount: 0, weight: 2 })).toBe('moderate');
    expect(severityFor({ failCount: 0, weight: 1 })).toBe('minor');
  });
});

describe('assembleReport', () => {
  const report = assembleReport(draft, context);

  it('keeps the computed severity, counts and evidence, ignoring the model', () => {
    expect(report.priorityIssues).toHaveLength(2);
    const cwv = report.priorityIssues.find((i) => i.check === 'core_web_vitals')!;
    expect(cwv.severity).toBe('critical');
    expect(cwv.affectedPagesCount).toBe(3);
    expect(cwv.affectedPages).toEqual(cwvIssue.affectedPages);
    expect(cwv.evidence).toContain('LCP 11.2s');
    expect(cwv.recommendation).toBe('قلل حجم الجافاسكريبت على الصفحة الأولى.');
  });

  it('drops issues the model invented', () => {
    expect(report.priorityIssues.some((i) => i.check === 'made_up_check')).toBe(false);
  });

  it('keeps only verified strengths', () => {
    expect(report.strengths.map((s) => s.check)).toEqual(['https']);
  });

  it('falls back to an Arabic explanation when the model skips an issue', () => {
    const withoutProse = assembleReport({ ...draft, priorityIssues: [] }, context);
    expect(withoutProse.priorityIssues[0].explanation).toContain('راجع الدليل');
    expect(withoutProse.priorityIssues[0].severity).toBe('critical');
  });

  it('replaces a numbers-only explanation with real prose and keeps the unmeasured note', () => {
    const terse = assembleReport(
      {
        ...draft,
        priorityIssues: [
          { check: 'core_web_vitals', explanation: 'LCP 2.9s, 2.6s, 2.2s', recommendation: 'Improve LCP' },
        ],
      },
      context,
    );
    const cwv = terse.priorityIssues.find((i) => i.check === 'core_web_vitals')!;
    expect(cwv.explanation).toContain('راجع الدليل');
    expect(cwv.explanation).toContain('لم يُقس');
    expect(cwv.explanation).toContain('INP');
    expect(cwv.recommendation).toContain('راجع الدليل');
  });

  it('adds the unmeasured note even when the model wrote good prose without it', () => {
    const cwv = report.priorityIssues.find((i) => i.check === 'core_web_vitals')!;
    expect(cwv.explanation).toContain('لم يُقس');
    expect(cwv.unmeasured).toEqual([{ metric: 'INP', pages: 1 }]);
  });

  it('caps quick wins at three', () => {
    expect(report.quickWins).toHaveLength(3);
  });
});
