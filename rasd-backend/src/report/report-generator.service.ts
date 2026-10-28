import { Injectable, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  seoReportSchema,
  seoReportSchemaEn,
  type SeoReport,
  type SeoReportDraft,
} from './schemas/report.schema.js';
import type { ComputedIssue, SiteReportContext } from './report-aggregator.service.js';
import type { Language } from '../common/language.js';

const MAX_REPORT_ISSUES = 8;
const MAX_REPORT_STRENGTHS = 5;

const arabicChars = (text: string | undefined) => (text?.match(/[\u0600-\u06FF]/g) ?? []).length;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const usableProse = (
  text: string | undefined,
  lang: Language,
  minArabic: number,
  minWords: number,
) => {
  if (!text) return undefined;
  const longEnough = lang === 'en' ? words(text) >= minWords : arabicChars(text) >= minArabic;
  return longEnough ? text.trim() : undefined;
};

function unmeasuredText(issue: ComputedIssue, lang: Language): string {
  return issue.unmeasured
    .map((item) =>
      lang === 'en'
        ? `${item.metric} (${item.pages} ${item.pages === 1 ? 'page' : 'pages'})`
        : `${item.metric} (${item.pages === 1 ? 'صفحة واحدة' : `${item.pages} صفحات`})`,
    )
    .join(lang === 'en' ? ', ' : '، ');
}

function formatIssues(context: SiteReportContext, lang: Language): string {
  if (context.issues.length === 0) {
    return lang === 'en' ? 'No issues detected.' : 'لا توجد مشاكل مرصودة.';
  }

  return context.issues
    .slice(0, MAX_REPORT_ISSUES)
    .map((issue, index) => {
      if (lang === 'en') {
        const scope =
          issue.scope === 'site'
            ? 'site-wide'
            : `${issue.affectedPagesCount} affected ${issue.affectedPagesCount === 1 ? 'page' : 'pages'}`;
        return [
          `${index + 1}) ${issue.check} — ${issue.severity} — ${scope}`,
          `   Evidence: ${issue.evidence}`,
          issue.affectedPages.length > 0 ? `   Pages: ${issue.affectedPages.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

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
export function assembleReport(
  draft: SeoReportDraft,
  context: SiteReportContext,
  lang: Language = 'ar',
): SeoReport {
  const proseByCheck = new Map(draft.priorityIssues.map((issue) => [issue.check?.trim(), issue]));

  const issues = context.issues.slice(0, MAX_REPORT_ISSUES).map((issue) => {
    const prose = proseByCheck.get(issue.check);

    const fallbackExplanation =
      lang === 'en'
        ? `The scan found ${issue.affectedPagesCount} affected ${issue.affectedPagesCount === 1 ? 'page' : 'pages'}. Review the measured evidence below.`
        : `الفحص رصد ${issue.affectedPagesCount} صفحة متأثرة. راجع الدليل المقاس أدناه.`;

    let explanation =
      usableProse(prose?.explanation, lang, 20, 6) ?? fallbackExplanation;

    // Honesty guard: if a metric was not measured, the reader must be told even
    // when the model forgets it.
    const unmeasuredMentioned =
      lang === 'en'
        ? /not measured|unmeasured/i.test(explanation)
        : /لم يُقس|لم يتم قياس|غير مقاس/.test(explanation);
    if (issue.unmeasured.length > 0 && !unmeasuredMentioned) {
      explanation =
        lang === 'en'
          ? `${explanation} — Not measured: ${unmeasuredText(issue, lang)}.`
          : `${explanation} — لم يُقس: ${unmeasuredText(issue, lang)}.`;
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
        usableProse(prose?.recommendation, lang, 10, 3) ??
        (lang === 'en'
          ? 'Review the measured evidence and apply a fix tied to it.'
          : 'راجع الدليل المقاس وطبّق إصلاحًا مرتبطًا به.'),
    };
  });

  const strengthProse = new Map(draft.strengths.map((strength) => [strength.check?.trim(), strength]));

  const strengths = context.verifiedStrengths.slice(0, MAX_REPORT_STRENGTHS).map((check) => {
    const prose = strengthProse.get(check);
    return {
      check,
      title: prose?.title?.trim() || check,
      explanation:
        prose?.explanation?.trim() ||
        (lang === 'en' ? 'This check passed on every page.' : 'الفحص ناجح على كل الصفحات.'),
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

const ARABIC_SYSTEM_PROMPT = `أنت خبير SEO بتكتب تقرير لعميل صاحب موقع، مش لمطور تقني.
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
- اكتب بإيجاز: كل شرح وتوصية من جملة أو جملتين، وأغلق JSON بالكامل قبل إنهاء الإجابة.`;

const ARABIC_HUMAN_PROMPT = `بيانات فحص الموقع {siteUrl} ({pageCount} صفحة تم فحصها، متوسط الدرجة الداخلية: {averageScore}/100).

المشاكل المرصودة (مرتبة بالأولوية، الأولوية والأعداد محسوبة في الكود):
{issues}

نقاط القوة المؤكدة (فحوصات ناجحة على كل الصفحات):
{strengths}

اكتب التقرير بناءً على الأدلة دي فقط.`;

const ENGLISH_SYSTEM_PROMPT = `You are an SEO expert writing a report for a site owner, not for a technical developer.
Strict rules:
- Write in clear, simple English without unexplained jargon.
- In priorityIssues write only about the checks in the list, in the same order: explanation and recommendation for each. Never add or remove a check.
- explanation must be one or two complete English sentences: what the problem is, what the measured value means, and its impact on the user. Never return just a list of numbers or check names without explanation.
- Never invent numbers: any number you write must appear verbatim in the "Evidence" field. If there is no number in the evidence, describe it without one.
- Never say a metric is healthy or measured if the evidence says "not measured" — state explicitly that it was not measured and on how many pages.
- The recommendation must target what the check actually measures. If the evidence does not identify the cause, suggest a specific diagnostic step instead of a final diagnosis.
- In strengths write only about the checks in the "Verified strengths" list.
- Priority and page counts are already computed on our side — do not repeat or try to change them.
- The score is our internal score, not a Google ranking.
- Be concise: every explanation and recommendation is one or two sentences, and close the JSON completely before ending the response.`;

const ENGLISH_HUMAN_PROMPT = `Scan data for {siteUrl} ({pageCount} pages scanned, average internal score: {averageScore}/100).

Detected issues (prioritized; priority and counts are computed in code):
{issues}

Verified strengths (checks that passed on every page):
{strengths}

Write the report based only on this evidence.`;

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  private readonly models = {
    ar: new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-20b',
      temperature: 0.2,
      maxTokens: 4096,
    }).withStructuredOutput(seoReportSchema),
    en: new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-20b',
      temperature: 0.2,
      maxTokens: 4096,
    }).withStructuredOutput(seoReportSchemaEn),
  };

  private readonly prompts: Record<Language, ChatPromptTemplate> = {
    ar: ChatPromptTemplate.fromMessages([
      ['system', ARABIC_SYSTEM_PROMPT],
      ['human', ARABIC_HUMAN_PROMPT],
    ]),
    en: ChatPromptTemplate.fromMessages([
      ['system', ENGLISH_SYSTEM_PROMPT],
      ['human', ENGLISH_HUMAN_PROMPT],
    ]),
  };

  async generate(context: SiteReportContext, lang: Language = 'ar'): Promise<SeoReport> {
    const chain = this.prompts[lang].pipe(this.models[lang]);

    const strengthsText =
      context.verifiedStrengths.length > 0
        ? context.verifiedStrengths.map((check) => `- ${check}`).join('\n')
        : lang === 'en'
          ? 'No checks passed on every page.'
          : 'لا توجد فحوصات ناجحة على كل الصفحات.';

    try {
      const draft = await chain.invoke({
        siteUrl: context.siteUrl,
        pageCount: context.pageCount,
        averageScore: context.averageScore,
        issues: formatIssues(context, lang),
        strengths: strengthsText,
      });

      const knownChecks = new Set(context.issues.map((issue) => issue.check));
      const invented = draft.priorityIssues
        .map((issue) => issue.check)
        .filter((check) => !knownChecks.has(check));
      if (invented.length > 0) {
        this.logger.warn(`Report mentioned checks that were not in the evidence: ${invented.join(', ')}`);
      }

      return assembleReport(draft, context, lang);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report generation failed (${lang}): ${message}`);
      throw err;
    }
  }
}
