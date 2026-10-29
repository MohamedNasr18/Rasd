import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatAgentService } from './chat-agent.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { ReportAggregatorService, SiteReportContext } from '../report/report-aggregator.service.js';
import type { Language } from '../common/language.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private static readonly FIXED_FACTS = `حقائق ثابتة (تتغلب على أي معلومة من ذاكرتك):
- مقاييس Core Web Vitals الحالية ثلاثة فقط: LCP وINP وCLS.
- مقياس FID اتشال وحل محله INP في مارس 2024. ممنوع تذكره كمقياس حالي أو تعرض كود onFID. لو المستخدم سأل عنه، وضّح إنه متقاعد.`;

  private static readonly FIXED_FACTS_EN = `Fixed facts (these override anything from your own memory):
- Core Web Vitals currently has exactly three metrics: LCP, INP, and CLS.
- FID was retired and replaced by INP in March 2024. Never present it as a current metric and never output onFID code. If the user asks about it, clarify that it is retired.`;

  private static readonly STALE_RE = /\bFID\b|First Input Delay|onFID/i;
  private static readonly RETIRED_RE =
    /متقاعد|اتشال|اتشالت|اتوقف|اوقف|إيقاف|ايقاف|موقوف|متوقف|حلّ?\s*(?:محل|مكان)|حلّ?ت(?:ه|ها)|استُ?بدل|بديل|بدّل|بدل|خارج\s*(?:ال)?مقاييس|مش\s*جزء|ما\s*بقىش|لم\s*يعد|ملغى|أُلغي|الغي|retir|replac|deprecat|removed|no longer|sunset|phased out|successor/i;
  private static readonly ONFID_CODE_RE = /\bonFID\s*\(/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: ChatAgentService,
    private readonly aggregator: ReportAggregatorService,
    private readonly kb: KnowledgeBaseService,
  ) {}

  async sendMessage(
    siteScanId: string,
    userMessage: string,
    conversationId?: string,
    lang: Language = 'ar',
  ) {
    const siteScan = await this.prisma.siteScan.findUnique({ where: { id: siteScanId } });
    if (!siteScan) throw new NotFoundException('Site scan not found.');

    const conversation = conversationId
      ? await this.prisma.conversation.findUniqueOrThrow({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        })
      : await this.prisma.conversation.create({
          data: { siteScanId },
          include: { messages: true },
        });

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: userMessage },
    });

    const context = await this.aggregator.buildContext(siteScanId);
    const guidance = await this.retrieveGuidanceOrEmpty(userMessage);
    this.logger.debug(
      `Retrieved ${guidance.length} knowledge chunk(s) for "${userMessage}":\n${guidance.join('\n---\n')}`,
    );
    const systemPrompt = this.buildSystemPrompt(context, guidance, lang);

    const history: BaseMessage[] = conversation.messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );

    const agent = this.agentService.createAgent(siteScanId, siteScan.siteId, systemPrompt, lang);

    const result = await agent.invoke({
      messages: [new SystemMessage(systemPrompt), ...history, new HumanMessage(userMessage)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    let assistantReply = String(lastMessage.content);

    if (this.hasStaleClaim(assistantReply)) {
      this.logger.warn('Stale claim (FID) detected in reply, regenerating once');
      const retryInstruction =
        lang === 'en'
          ? 'Your reply mentions FID as a current metric, which is wrong. FID was retired in March 2024 and replaced by INP. Rewrite the entire reply in English without FID, using INP instead.'
          : 'الرد فيه FID كمقياس حالي وده غلط، اتشال في مارس 2024 وحل محله INP. أعد كتابة الرد كامل بدون FID واستخدم INP.';
      const retry = await agent.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          ...history,
          new HumanMessage(userMessage),
          new AIMessage(assistantReply),
          new HumanMessage(retryInstruction),
        ],
      });
      assistantReply = String(retry.messages[retry.messages.length - 1].content);
      if (this.hasStaleClaim(assistantReply)) {
        this.logger.warn('Reply still contains a stale FID claim after regeneration');
      }
    }

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: assistantReply },
    });

    return { conversationId: conversation.id, reply: assistantReply };
  }

  async getHistory(conversationId: string) {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async retrieveGuidanceOrEmpty(query: string): Promise<string[]> {
    try {
      return await this.kb.retrieveGuidance(query);
    } catch (err) {
      this.logger.warn(
        `Knowledge base retrieval failed, answering without retrieved guidance: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private hasStaleClaim(text: string): boolean {
    if (!ChatService.STALE_RE.test(text)) return false;
    if (ChatService.ONFID_CODE_RE.test(text)) return true;
    return !ChatService.RETIRED_RE.test(text);
  }

  private buildSystemPrompt(
    context: SiteReportContext,
    guidance: string[],
    lang: Language,
  ): string {
    return lang === 'en'
      ? this.buildEnglishSystemPrompt(context, guidance)
      : this.buildArabicSystemPrompt(context, guidance);
  }

  private buildArabicSystemPrompt(context: SiteReportContext, guidance: string[]): string {
    const issuesSummary = context.aggregatedChecks
      .filter((c) => c.failCount + c.warningCount > 0)
      .slice(0, 10)
      .map(
        (c) =>
          `- ${c.check} (أهمية ${c.weight}/3): ${c.failCount} فشل، ${c.warningCount} تحذير عبر ${c.affectedPageUrls.length} صفحة على الأقل`,
      )
      .join('\n');

    const guidanceBlock =
      guidance.length > 0
        ? guidance.join('\n---\n')
        : 'مفيش مراجع مسترجعة للرسالة دي. لو محتاج تفاصيل تقنية، استدعي retrieve_seo_knowledge.';

    return `أنت مساعد SEO بتساعد صاحب الموقع ${context.siteUrl} في فهم وإصلاح مشاكل موقعه.

بيانات الموقع الحالية (من آخر فحص كامل):
- عدد الصفحات المفحوصة: ${context.pageCount}
- متوسط الـ score: ${context.averageScore}/100
- أهم المشاكل المكتشفة:
${issuesSummary}

مراجع موثوقة مسترجعة من قاعدة المعرفة (اتسجلت قبل ما الرد ده يبدأ):
${guidanceBlock}

${ChatService.FIXED_FACTS}

قواعد مهمة:
- الحقائق الثابتة فوق والمراجع المسترجعة هي أساسك الفني في الرد، وأي حاجة فيها تتغلب على معرفتك العامة.
- مقاييس الأداء الحالية اتكلم عنها دايمًا بـ LCP وINP وCLS. ممنوع تذكر FID كمقياس حالي أو تعرض كود onFID — لو المستخدم سأل عنه وضّح إنه اتشال في مارس 2024 وحل محله INP.
- لو المراجع مش كافية لسؤال تقني محدد، استخدم أداة retrieve_seo_knowledge عشان تجيب تفاصيل إضافية.
- لما تقترح كود أو props خاصة بإطار عمل معين (Next.js وغيره)، استخدم بس اللي موجود في المراجع المسترجعة. لو مش موجود، اشرح المبدأ من غير كود وقول إن التفاصيل بتختلف حسب إصدار الإطار.
- لو اليوزر قال إنه عدّل حاجة في صفحة معينة وعايز يتأكد، استخدم rerun_page_scan على اللينك ده، وبعدها استخدم compare_scans عشان توريه بالظبط إيه اللي اتحسن.
- جاوب بالعربية دايمًا، بلغة بسيطة وودودة، ومختصرة قدر الإمكان.
- متخترعش معلومات مش موجودة في البيانات اللي معاك أو في نتايج الأدوات.`;
  }

  private buildEnglishSystemPrompt(context: SiteReportContext, guidance: string[]): string {
    const issuesSummary = context.aggregatedChecks
      .filter((c) => c.failCount + c.warningCount > 0)
      .slice(0, 10)
      .map(
        (c) =>
          `- ${c.check} (priority ${c.weight}/3): ${c.failCount} failures, ${c.warningCount} warnings across at least ${c.affectedPageUrls.length} page(s)`,
      )
      .join('\n');

    const guidanceBlock =
      guidance.length > 0
        ? guidance.join('\n---\n')
        : 'No reference material was retrieved for this message. If you need technical detail, call retrieve_seo_knowledge.';

    return `You are an SEO assistant helping the owner of ${context.siteUrl} understand and fix issues on their site.

Current site data (from the latest full scan):
- Pages scanned: ${context.pageCount}
- Average score: ${context.averageScore}/100
- Top detected issues:
${issuesSummary}

Trusted references retrieved from the knowledge base (fetched before this reply started):
${guidanceBlock}

${ChatService.FIXED_FACTS_EN}

Important rules:
- The fixed facts above and the retrieved references are your technical source of truth; they override your general knowledge.
- Always discuss current performance metrics as LCP, INP, and CLS. Never mention FID as a current metric and never output onFID code — if the user asks about it, explain that it was retired in March 2024 and replaced by INP.
- If the references are not enough for a specific technical question, use the retrieve_seo_knowledge tool to fetch more detail.
- When suggesting code or framework-specific props (Next.js and others), only use what appears in the retrieved references. If it is not there, explain the principle without code and note that details vary by framework version.
- If the user says they changed something on a specific page and wants it verified, use rerun_page_scan on that URL, then use compare_scans to show exactly what improved.
- Always reply in English, in simple, friendly language, and keep it as brief as possible.
- Never invent information that is not in the data you have or in the tool results.`;
  }
}