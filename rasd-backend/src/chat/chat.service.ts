import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatAgentService } from './chat-agent.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { ReportAggregatorService, SiteReportContext } from '../report/report-aggregator.service.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /**
   * Hard facts that must win over whatever the model "remembers" or over
   * incomplete knowledge-base chunks (the INP article never states that FID
   * was retired from Core Web Vitals).
   */
  private static readonly FIXED_FACTS = `حقائق ثابتة (تتغلب على أي معلومة من ذاكرتك):
- مقاييس Core Web Vitals الحالية ثلاثة فقط: LCP وINP وCLS.
- مقياس FID اتشال وحل محله INP في مارس 2024. ممنوع تذكره كمقياس حالي أو تعرض كود onFID. لو المستخدم سأل عنه، وضّح إنه متقاعد.`;

  private static readonly STALE_RE = /\bFID\b|First Input Delay|onFID/i;
  // Any wording that says FID is no longer a current metric (Arabic or English).
  private static readonly RETIRED_RE =
    /متقاعد|اتشال|اتشالت|اتوقف|اوقف|إيقاف|ايقاف|موقوف|متوقف|حلّ?\s*(?:محل|مكان)|حلّ?ت(?:ه|ها)|استُ?بدل|بديل|بدّل|بدل|خارج\s*(?:ال)?مقاييس|مش\s*جزء|ما\s*بقىش|لم\s*يعد|ملغى|أُلغي|الغي|retir|replac|deprecat|removed|no longer|sunset|phased out|successor/i;
  // Using the retired API in a code sample is always wrong, even if the text
  // around it explains the retirement.
  private static readonly ONFID_CODE_RE = /\bonFID\s*\(/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: ChatAgentService,
    private readonly aggregator: ReportAggregatorService,
    private readonly kb: KnowledgeBaseService,
  ) {}

  async sendMessage(siteScanId: string, userMessage: string, conversationId?: string) {
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
    const systemPrompt = this.buildSystemPrompt(context, guidance);

    const history: BaseMessage[] = conversation.messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );

    const agent = this.agentService.createAgent(siteScanId, siteScan.siteId, systemPrompt);

    const result = await agent.invoke({
      messages: [new SystemMessage(systemPrompt), ...history, new HumanMessage(userMessage)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    let assistantReply = String(lastMessage.content);

    if (this.hasStaleClaim(assistantReply)) {
      this.logger.warn('Stale claim (FID) detected in reply, regenerating once');
      const retry = await agent.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          ...history,
          new HumanMessage(userMessage),
          new AIMessage(assistantReply),
          new HumanMessage(
            'الرد فيه FID كمقياس حالي وده غلط، اتشال في مارس 2024 وحل محله INP. أعد كتابة الرد كامل بدون FID واستخدم INP.',
          ),
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

  /**
   * Retrieval is mandatory: it runs before the agent on every message instead of
   * relying on the LLM deciding to call retrieve_seo_knowledge.
   */
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

  private buildSystemPrompt(context: SiteReportContext, guidance: string[]): string {
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
}