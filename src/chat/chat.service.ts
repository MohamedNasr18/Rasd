import { Injectable, NotFoundException } from '@nestjs/common';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatAgentService } from './chat-agent.service.js';
import { ReportAggregatorService, SiteReportContext } from '../report/report-aggregator.service.js';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: ChatAgentService,
    private readonly aggregator: ReportAggregatorService,
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
    const systemPrompt = this.buildSystemPrompt(context);

    const history: BaseMessage[] = conversation.messages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );

    const agent = this.agentService.createAgent(siteScanId, siteScan.siteId, systemPrompt);

    const result = await agent.invoke({
      messages: [new SystemMessage(systemPrompt), ...history, new HumanMessage(userMessage)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const assistantReply = String(lastMessage.content);

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

  private buildSystemPrompt(context: SiteReportContext): string {
    const issuesSummary = context.aggregatedChecks
      .filter((c) => c.failCount + c.warningCount > 0)
      .slice(0, 10)
      .map(
        (c) =>
          `- ${c.check} (أهمية ${c.weight}/3): ${c.failCount} فشل، ${c.warningCount} تحذير عبر ${c.affectedPageUrls.length} صفحة على الأقل`,
      )
      .join('\n');

    return `أنت مساعد SEO بتساعد صاحب الموقع ${context.siteUrl} في فهم وإصلاح مشاكل موقعه.

بيانات الموقع الحالية (من آخر فحص كامل):
- عدد الصفحات المفحوصة: ${context.pageCount}
- متوسط الـ score: ${context.averageScore}/100
- أهم المشاكل المكتشفة:
${issuesSummary}

قواعد مهمة:
- لما اليوزر يسأل "إزاي أصلح X"، استخدم أداة retrieve_seo_knowledge أولًا قبل ما تجاوب — متعتمدش على معرفتك العامة لتفاصيل تقنية دقيقة زي الأرقام أو خطوات منصة معينة.
- لو اليوزر قال إنه عدّل حاجة في صفحة معينة وعايز يتأكد، استخدم rerun_page_scan على اللينك ده، وبعدها استخدم compare_scans عشان توريه بالظبط إيه اللي اتحسن.
- جاوب بالعربية دايمًا، بلغة بسيطة وودودة، ومختصرة قدر الإمكان.
- متخترعش معلومات مش موجودة في البيانات اللي معاك أو في نتايج الأدوات.`;
  }
}