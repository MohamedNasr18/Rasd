import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('report-generation') private readonly reportQueue: Queue,
  ) {}

  async enqueueReport(siteScanId: string) {
    const siteScan = await this.prisma.siteScan.findUnique({ where: { id: siteScanId } });
    if (!siteScan) throw new NotFoundException('Site scan not found.');
    if (siteScan.status !== 'completed') {
      throw new BadRequestException('Site scan is still processing — wait until it completes before generating a report.');
    }

    await this.prisma.siteScan.update({
      where: { id: siteScanId },
      data: { reportStatus: 'processing' },
    });

    const job = await this.reportQueue.add('generate-report', { siteScanId });
    return { jobId: job.id, siteScanId };
  }

  async getReport(siteScanId: string) {
    const siteScan = await this.prisma.siteScan.findUnique({
      where: { id: siteScanId },
      select: { reportStatus: true, aiReport: true },
    });
    if (!siteScan) throw new NotFoundException('Site scan not found.');
    return siteScan;
  }
}