import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface AggregationJobData {
  siteScanId: string;
}

@Processor('site-aggregation')
export class SiteAggregationProcessor extends WorkerHost {
  private readonly logger = new Logger(SiteAggregationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AggregationJobData>) {
    const { siteScanId } = job.data;
    const childrenValues = await job.getChildrenValues();
    const allResults = Object.values(childrenValues) as { type: string; url: string; score: number | null }[];
    const pageResults = allResults.filter((r) => r.type === 'page');

    const validScores = pageResults.filter((p) => p.score !== null).map((p) => p.score as number);
    const averageScore = validScores.length > 0
      ? Math.round(validScores.reduce((sum, s) => sum + s, 0) / validScores.length)
      : 0;

    await this.prisma.siteScan.update({
      where: { id: siteScanId },
      data: { status: 'completed', averageScore },
    });

    this.logger.log(`Site scan ${siteScanId} completed — average score: ${averageScore} across ${validScores.length} pages`);
    return { siteScanId, averageScore, pageCount: pageResults.length };
  }
}