import { z } from 'zod';

/**
 * What the model is allowed to write: prose only.
 * Severity, affected page counts and evidence are computed from the checks in
 * code (see ReportAggregatorService) so the model cannot invent numbers.
 */
export const seoReportSchema = z.object({
  executiveSummary: z
    .string()
    .describe('ملخص من 3-4 جمل لأهم ما وجده الفحص، بدون أرقام غير موجودة في الأدلة'),
  overallScoreComment: z
    .string()
    .describe('تعليق من جملتين على الدرجة الإجمالية، مع توضيح أنها درجة داخلية وليست ترتيبًا من جوجل'),
  strengths: z
    .array(
      z.object({
        check: z.string().describe('اسم الفحص كما هو مكتوب في قائمة نقاط القوة المعطاة'),
        title: z.string().describe('عنوان عربي قصير لنقطة القوة'),
        explanation: z.string().describe('شرح مبني على دليل الفحص فقط'),
      }),
    )
    .describe('اكتب فقط عن الفحوصات الموجودة في قائمة نقاط القوة المعطاة'),
  priorityIssues: z
    .array(
      z.object({
        check: z.string().describe('اسم الفحص كما هو مكتوب في قائمة المشاكل المعطاة'),
        explanation: z
          .string()
          .describe('شرح عربي كامل في جملة أو جملتين: ما المشكلة، ومعنى القيمة المقاسة، وأثرها. ممنوع إرجاع قائمة أرقام فقط'),
        recommendation: z
          .string()
          .describe('خطوة عملية مرتبطة بالفحص وبالقيمة المقاسة، مش نصيحة عامة'),
      }),
    )
    .describe('اكتب عن كل فحص في قائمة المشاكل بنفس الترتيب، بدون إضافة أو حذف'),
  quickWins: z
    .array(z.string())
    .describe('من 1 إلى 3 خطوات سريعة، كل واحدة مربوطة بمشكلة موجودة في القائمة'),
});

export type SeoReportDraft = z.infer<typeof seoReportSchema>;

export type IssueSeverity = 'critical' | 'moderate' | 'minor';

export interface UnmeasuredMetric {
  metric: string;
  pages: number;
}

export interface SeoReportIssue {
  check: string;
  scope: 'page' | 'site';
  severity: IssueSeverity;
  affectedPagesCount: number;
  affectedPages: string[];
  /** Metrics the check could not measure (e.g. INP when CrUX has no data). */
  unmeasured: UnmeasuredMetric[];
  /** The measured values / raw check output the explanation must be based on. */
  evidence: string;
  explanation: string;
  recommendation: string;
}

export interface SeoReportStrength {
  check: string;
  title: string;
  explanation: string;
}

export interface SeoReport {
  executiveSummary: string;
  overallScoreComment: string;
  strengths: SeoReportStrength[];
  priorityIssues: SeoReportIssue[];
  quickWins: string[];
}
