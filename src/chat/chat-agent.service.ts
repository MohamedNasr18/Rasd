import { Injectable } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { BaseMessage } from '@langchain/core/messages';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { RendererService } from '../seo/renderer.service.js';
import { SeoAnalyzerService, SeoCheckResult } from '../seo/seo-analyzer.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';

interface ChatAgent {
  invoke(input: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }>;
}

@Injectable()
export class ChatAgentService {
  constructor(
    private readonly renderer: RendererService,
    private readonly analyzer: SeoAnalyzerService,
    private readonly prisma: PrismaService,
    private readonly kb: KnowledgeBaseService,
  ) {}

  private buildTools(siteScanId: string, siteId: string) {
    const retrieveKnowledgeTool = tool(
      async ({ query, checkType }: { query: string; checkType?: string }) => {
        const docs = await this.kb.retrieveGuidance(query, checkType);
        return docs.length > 0 ? docs.join('\n---\n') : 'لا توجد معلومات مرجعية متاحة عن ده.';
      },
      {
        name: 'retrieve_seo_knowledge',
        description:
          'Search official SEO/web documentation (Core Web Vitals, structured data, framework-specific guides) for accurate guidance. ALWAYS use this before explaining how to fix a technical issue — never rely on memorized knowledge for thresholds or platform-specific steps.',
        schema: z.object({
          query: z.string().describe('The specific question or issue to search documentation for'),
          checkType: z
            .string()
            .optional()
            .describe('Optional filter: the exact check name (e.g. core_web_vitals, structured_data, title_tag)'),
        }),
      },
    );

    const rerunPageScanTool = tool(
      async ({ url }: { url: string }) => {
        const previousScan = await this.prisma.scan.findFirst({
          where: { siteScanId, url },
          orderBy: { createdAt: 'desc' },
        });

        const { html, headers } = await this.renderer.renderPage(url);
        const { score, results } = await this.analyzer.analyze(html, url, headers);

        const newScan = await this.prisma.scan.create({
          data: {
            siteId,
            siteScanId,
            url,
            score,
            results: results as unknown as Prisma.InputJsonValue,
            triggeredBy: 'agent_rescan',
            previousScanId: previousScan?.id ?? null,
          },
        });

        return JSON.stringify({
          newScanId: newScan.id,
          previousScanId: previousScan?.id ?? null,
          newScore: score,
          previousScore: previousScan?.score ?? null,
          message: previousScan
            ? 'Re-scan complete. Use compare_scans with these two IDs to see what changed.'
            : 'Re-scan complete. No previous scan of this exact URL was found to compare against.',
        });
      },
      {
        name: 'rerun_page_scan',
        description:
          "Re-scan a specific page URL to check whether the user's recent edits fixed the issues. Use this when the user says they made a change and wants it verified.",
        schema: z.object({
          url: z.string().url().describe('The exact page URL to re-scan'),
        }),
      },
    );

    const compareScansTool = tool(
      async ({ newScanId, previousScanId }: { newScanId: string; previousScanId: string }) => {
        const [newScan, oldScan] = await Promise.all([
          this.prisma.scan.findUniqueOrThrow({ where: { id: newScanId } }),
          this.prisma.scan.findUniqueOrThrow({ where: { id: previousScanId } }),
        ]);

        const oldResults = oldScan.results as unknown as SeoCheckResult[];
        const newResults = newScan.results as unknown as SeoCheckResult[];

        const changedChecks = newResults
          .map((newR) => {
            const oldR = oldResults.find((o) => o.check === newR.check);
            return { check: newR.check, before: oldR?.status ?? 'unknown', after: newR.status };
          })
          .filter((d) => d.before !== d.after);

        return JSON.stringify({
          scoreBefore: oldScan.score,
          scoreAfter: newScan.score,
          scoreDelta: newScan.score - oldScan.score,
          changedChecks,
        });
      },
      {
        name: 'compare_scans',
        description:
          'Compare an old scan and a new scan (by their IDs) to see exactly which checks improved, regressed, or stayed the same, and the score change. Always call this right after rerun_page_scan when a previous scan exists.',
        schema: z.object({
          newScanId: z.string().describe('The new scan ID returned by rerun_page_scan'),
          previousScanId: z.string().describe('The previous scan ID to compare against'),
        }),
      },
    );

    return [retrieveKnowledgeTool, rerunPageScanTool, compareScansTool];
  }

  createAgent(siteScanId: string, siteId: string, systemPrompt: string): ChatAgent {
    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-20b',
      temperature: 0.3,
      maxTokens: 4096,
    });
    const tools = this.buildTools(siteScanId, siteId);

    return createReactAgent({ llm: model, tools, prompt: systemPrompt });
  }
}