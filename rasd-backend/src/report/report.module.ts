import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';
import { ReportAggregatorService } from './report-aggregator.service.js';
import { ReportGeneratorService } from './report-generator.service.js';
import { ReportProcessor } from './report.processor.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'report-generation' }), AuthModule],
  controllers: [ReportController],
  providers: [ReportService, ReportAggregatorService, ReportGeneratorService, ReportProcessor],
  exports: [ReportAggregatorService],
})
export class ReportModule {}