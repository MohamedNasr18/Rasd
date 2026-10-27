import { Injectable, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { seoReportSchema, type SeoReport, type SeoReportDraft } from './schemas/report.schema.js';
import type { ComputedIssue, SiteReportContext } from './report-aggregator.service.js';

const MAX_REPORT_ISSUES = 8;
const MAX_REPORT_STRENGTHS = 5;

const arabicChars = (text: string | undefined) => (text?.match(/[\u0600-\u06FF]/g) ?? []).length;
const usableProse = (text: string | undefined, minArabic: number) =>
  text && arabicChars(text) >= minArabic ? text.trim() : undefined;

function unmeasuredText(issue: ComputedIssue): string {
  return issue.unmeasured
    .map((item) => `${item.metric} (${item.pages === 1 ? 'صفحة واحدة' : `${item.pages} صفحات`})`)
    .join('، ');
}

function formatIssues(context: SiteReportContext): string {
  if (context.issues.length === 0) return 'لا توجد مشاكل مرصودة.';

  return context.issues
    .slice(0, MAX_REPORT_ISSUES)
    .map((issue, index) => {
      const scope = issue.scope === 'site'
        ? 'على مستوى الموقع بالكامل'
        : `${issue.affectedPagesCount} صفحة متأثرة`;
      return [
        `${index + 1}) ${issue.check} — ${issue.severity} — ${scope}`,
        `   الدليل: ${issue.evidence}`,
        issue.affectedPages.length > 0 ? `   الصفحات: ${issue.affectedPages.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/**
 * Merges the model's prose with the computed facts. The model can never change
 * severity, page counts, affected URLs or evidence — and any check it invents is
 * ignored.
 */
export function assembleReport(draft: SeoReportDraft, context: SiteReportContext): SeoReport {
  const proseByCheck = new Map(draft.priorityIssues.map((issue) => [issue.check?.trim(), issue]));

  const issues = context.issues.slice(0, MAX_REPORT_ISSUES).map((issue) => {
    const prose = proseByCheck.get(issue.check);

    let explanation =
      usableProse(prose?.explanation, 20) ??
      `الفحص رصد ${issue.affectedPagesCount} صفحة متأثرة. راجع الدليل المقاس أدناه.`;

    // Honesty guard: if a metric was not measured, the reader must be told even
    // when the model forgets it.
    if (issue.unmeasured.length > 0 && !/لم يُقس|لم يتم قياس|غير مقاس/.test(explanation)) {
      explanation = `${explanation} — لم يُقس: ${unmeasuredText(issue)}.`;
    }

    return {
      check: issue.check,
      scope: issue.scope,
      severity: issue.severity,
      affectedPagesCount: issue.affectedPagesCount,
      affectedPages: issue.affectedPages,
      unmeasured: issue.unmeasured,
      evidence: issue.evidence,
      explanation,
      recommendation:
        usableProse(prose?.recommendation, 10) ??
        'راجع الدليل المقاس وطبّق إصلاحًا مرتبطًا به.',
    };
  });

  const strengthProse = new Map(draft.strengths.map((strength) => [strength.check?.trim(), strength]));

  const strengths = context.verifiedStrengths.slice(0, MAX_REPORT_STRENGTHS).map((check) => {
    const prose = strengthProse.get(check);
    return {
      check,
      title: prose?.title?.trim() || check,
      explanation: prose?.explanation?.trim() || 'الفحص ناجح على كل الصفحات.',
    };
  });

  return {
    executiveSummary: draft.executiveSummary,
    overallScoreComment: draft.overallScoreComment,
    strengths,
    priorityIssues: issues,
    quickWins: draft.quickWins.slice(0, 3),
  };
}

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  private readonly model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'openai/gpt-oss-20b',
    temperature: 0.2,
    maxTokens: 4096,
  }).withStructuredOutput(seoReportSchema);

  private readonly prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `أنت خبير SEO بتكتب تقرير لعميل صاحب موقع، مش لمطور تقني.
قواعد صارمة:
- اكتب بالعربية الفصحى المبسطة، بدون مصطلحات معقدة بدون شرح.
- في priorityIssues اكتب فقط عن الفحوصات الموجودة في القائمة، بنفس ترتيبها: explanation و recommendation لكل فحص. ممنوع إضافة فحص مش في القائمة أو حذف فحص منها.
- explanation لازم تكون جملة أو جملتين عربيتين كاملتين: ما المشكلة، ومعنى القيمة المقاسة، وأثرها على المستخدم. ممنوع ترجع قائمة أرقام فقط أو أسماء فحوصات إنجليزية بدون شرح.
- ممنوع اختراع أرقام: أي رقم تكتبه لازم يكون موجودًا حرفيًا في حقل "الدليل". لو مفيش رقم في الدليل، اكتب وصفًا بدون رقم.
- ممنوع تقول إن مقياسًا سليم أو مقاس لو الدليل بيقول "not measured" أو "لم يُقس" — لازم تذكر صريح إنه لم يُقس وعلى كام صفحة.
- التوصية لازم تخص اللي الفحص بيقيسه فعلًا. لو الدليل مش محدد السبب، اقترح خطوة تشخيص محددة بدل تشخيص نهائي.
- في strengths اكتب فقط عن الفحوصات الموجودة في "نقاط القوة المؤكدة".
- الأولوية وعدد الصفحات محسوبين عندنا بالفعل — متكررهاش ولا تحاول تغييرها.
- الدرجة درجة داخلية من فحصنا وليست ترتيبًا من جوجل.
- اكتب بإيجاز: كل شرح وتوصية من جملة أو جملتين، وأغلق JSON بالكامل قبل إنهاء الإجابة.`,
    ],
    [
      'human',
      `بيانات فحص الموقع {siteUrl} ({pageCount} صفحة تم فحصها، متوسط الدرجة الداخلية: {averageScore}/100).

المشاكل المرصودة (مرتبة بالأولوية، الأولوية والأعداد محسوبة في الكود):
{issues}

نقاط القوة المؤكدة (فحوصات ناجحة على كل الصفحات):
{strengths}

اكتب التقرير بناءً على الأدلة دي فقط.`,
    ],
  ]);

  async generate(context: SiteReportContext): Promise<SeoReport> {
    const chain = this.prompt.pipe(this.model);

    const strengthsText = context.verifiedStrengths.length > 0
      ? context.verifiedStrengths.map((check) => `- ${check}`).join('\n')
      : 'لا توجد فحوصات ناجحة على كل الصفحات.';

    try {
      const draft = await chain.invoke({
        siteUrl: context.siteUrl,
        pageCount: context.pageCount,
        averageScore: context.averageScore,
        issues: formatIssues(context),
        strengths: strengthsText,
      });

      const knownChecks = new Set(context.issues.map((issue) => issue.check));
      const invented = draft.priorityIssues
        .map((issue) => issue.check)
        .filter((check) => !knownChecks.has(check));
      if (invented.length > 0) {
        this.logger.warn(`Report mentioned checks that were not in the evidence: ${invented.join(', ')}`);
      }

      return assembleReport(draft, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report generation failed: ${message}`);
      throw err;
    }
  }
}
