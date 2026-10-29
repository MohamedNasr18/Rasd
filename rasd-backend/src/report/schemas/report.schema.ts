import { z } from 'zod';

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

export const seoReportSchemaEn = z.object({
  executiveSummary: z
    .string()
    .describe('A 3-4 sentence summary of the most important findings, using only numbers present in the evidence'),
  overallScoreComment: z
    .string()
    .describe('A two-sentence comment on the overall score, clarifying it is an internal score, not a Google ranking'),
  strengths: z
    .array(
      z.object({
        check: z.string().describe('The check name exactly as written in the provided strengths list'),
        title: z.string().describe('A short English title for the strength'),
        explanation: z.string().describe('An explanation based only on the check evidence'),
      }),
    )
    .describe('Only write about checks present in the provided strengths list'),
  priorityIssues: z
    .array(
      z.object({
        check: z.string().describe('The check name exactly as written in the provided issues list'),
        explanation: z
          .string()
          .describe('A complete one or two sentence English explanation: what the problem is, what the measured value means, and its impact. Never return only a list of numbers'),
        recommendation: z
          .string()
          .describe('A concrete action tied to the check and the measured value, not generic advice'),
      }),
    )
    .describe('Cover every check in the issues list, in the same order, without adding or removing any'),
  quickWins: z
    .array(z.string())
    .describe('1 to 3 quick steps, each tied to an issue in the list'),
});

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
  unmeasured: UnmeasuredMetric[];
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
