import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';
import { ReportAggregatorService } from './report-aggregator.service.js';
import { ReportGeneratorService } from './report-generator.service.js';
import { ReportProcessor } from './report.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'report-generation' })],
  controllers: [ReportController],
  providers: [ReportService, ReportAggregatorService, ReportGeneratorService, ReportProcessor],
  exports: [ReportAggregatorService],
})
export class ReportModule {}