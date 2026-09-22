import { Injectable, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { seoReportSchema, SeoReport } from './schemas/report.schema.js';
import { SiteReportContext } from './report-aggregator.service.js';

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
- اكتب بالعربية الفصحى المبسطة، بدون مصطلحات تقنية معقدة بدون شرح.
- اعتمد فقط على البيانات المعطاة لك — لا تخترع أرقام أو تفاصيل غير موجودة في السياق.
- لو معلومة معينة مش موجودة في البيانات، متذكرهاش خالص بدل ما تخمّن.
- رتّب المشاكل حسب severity المعطى لك، ومتغيرش الترتيب بنفسك.
- كل توصية لازم تكون خطوة عملية واضحة، مش نصيحة عامة غامضة.
- اكتب بإيجاز: كل شرح وتوصية من جملة أو جملتين، وأغلق JSON بالكامل قبل إنهاء الإجابة.`,
    ],
    [
      'human',
      `بيانات فحص الموقع {siteUrl} ({pageCount} صفحة تم فحصها، المتوسط العام: {averageScore}/100):

مشاكل على مستوى الموقع كامل (robots.txt / sitemap.xml):
{siteLevelIssues}

المشاكل المكتشفة عبر الصفحات (مرتبة حسب الأهمية):
{aggregatedChecks}

اكتب تقرير SEO شامل بناءً على البيانات دي فقط.`,
    ],
  ]);

  async generate(context: SiteReportContext): Promise<SeoReport> {
    const chain = this.prompt.pipe(this.model);

    const aggregatedChecksText = context.aggregatedChecks
      .map((c) => {
        const total = c.failCount + c.warningCount + c.passCount;
        return [
          `- الفحص: ${c.check} (أهمية: ${c.weight}/3)`,
          `  النتيجة عبر الصفحات: ${c.failCount} فشل، ${c.warningCount} تحذير، ${c.passCount} ناجح (من أصل ${total})`,
          c.affectedPageUrls.length > 0 ? `  صفحات متأثرة (عينة): ${c.affectedPageUrls.join(', ')}` : '',
          c.sampleMessages.length > 0 ? `  أمثلة: ${c.sampleMessages.join(' | ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    const siteLevelText = context.siteLevelIssues.length > 0
      ? context.siteLevelIssues.map((r) => `- ${r.check}: ${r.message}`).join('\n')
      : 'لا توجد مشاكل على مستوى الموقع.';

    try {
      const result = await chain.invoke({
        siteUrl: context.siteUrl,
        pageCount: context.pageCount,
        averageScore: context.averageScore,
        siteLevelIssues: siteLevelText,
        aggregatedChecks: aggregatedChecksText,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report generation failed: ${message}`);
      throw err;
    }
  }
}