import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ReportAggregatorService } from './report-aggregator.service.js';
import { ReportGeneratorService } from './report-generator.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Language } from '../common/language.js';

interface ReportJobData {
  siteScanId: string;
  lang?: Language;
}

@Processor('report-generation', { concurrency: 2 })
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);

  constructor(
    private readonly aggregator: ReportAggregatorService,
    private readonly generator: ReportGeneratorService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ReportJobData>) {
    const { siteScanId, lang = 'ar' } = job.data;
    this.logger.log(`Generating AI report (${lang}) for siteScan ${siteScanId}`);

    try {
      const context = await this.aggregator.buildContext(siteScanId, lang);
      const report = await this.generator.generate(context, lang);

      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data:
          lang === 'en'
            ? {
                aiReportEn: report as unknown as Prisma.InputJsonValue,
                reportStatusEn: 'completed',
              }
            : {
                aiReport: report as unknown as Prisma.InputJsonValue,
                reportStatus: 'completed',
              },
      });

      return { siteScanId, lang, status: 'completed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report generation failed for ${siteScanId} (${lang}): ${message}`);
      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: lang === 'en' ? { reportStatusEn: 'failed' } : { reportStatus: 'failed' },
      });
      throw err;
    }
  }
}
