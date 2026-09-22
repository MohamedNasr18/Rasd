import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReportAggregatorService } from './report-aggregator.service.js';
import { ReportGeneratorService } from './report-generator.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface ReportJobData {
  siteScanId: string;
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
    const { siteScanId } = job.data;
    this.logger.log(`Generating AI report for siteScan ${siteScanId}`);

    try {
      const context = await this.aggregator.buildContext(siteScanId);
      const report = await this.generator.generate(context);

      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: { aiReport: report, reportStatus: 'completed' },
      });

      return { siteScanId, status: 'completed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Report generation failed for ${siteScanId}: ${message}`);
      await this.prisma.siteScan.update({
        where: { id: siteScanId },
        data: { reportStatus: 'failed' },
      });
      throw err;
    }
  }
}