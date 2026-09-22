import { z } from 'zod';

export const seoReportSchema = z.object({
  executiveSummary: z
    .string()
    .describe('فقرة من 3-4 جمل بالعربية تلخص الحالة العامة للموقع بلغة بسيطة لصاحب الموقع، مش خبير تقني'),
  overallScoreComment: z
    .string()
    .describe('جملة واحدة بتشرح معنى الـ score الإجمالي (مثلاً: هل ده جيد، متوسط، ضعيف مقارنة بالمعايير)'),
  strengths: z
    .array(
      z.object({
        title: z.string().describe('عنوان قصير لنقطة القوة'),
        explanation: z.string().describe('شرح مبسط ليه دي نقطة قوة'),
      }),
    )
    .describe('حد أقصى 5 نقاط قوة — حاجات الموقع بيعملها صح بالفعل'),
  priorityIssues: z
    .array(
      z.object({
        check: z.string().describe('اسم الفحص التقني (مثال: core_web_vitals)'),
        severity: z.enum(['critical', 'moderate', 'minor']),
        affectedPagesCount: z.number(),
        explanation: z
          .string()
          .describe('شرح المشكلة بلغة بسيطة، ليه هي مهمة، وتأثيرها على ظهور الموقع في البحث'),
        recommendation: z
          .string()
          .describe('خطوة عملية واضحة لحل المشكلة، مبنية على المصادر الرسمية المعطاة'),
      }),
    )
    .describe('مرتبة من الأهم للأقل أهمية، حد أقصى 8 مشاكل'),
  quickWins: z
    .array(z.string())
    .describe('حد أقصى 3 إصلاحات سريعة وسهلة التنفيذ يقدر صاحب الموقع يعملها في نفس اليوم'),
});

export type SeoReport = z.infer<typeof seoReportSchema>;