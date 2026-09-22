import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SeoController } from './seo.controller.js';
import { SeoService } from './seo.service.js';
import { SeoAnalyzerService } from './seo-analyzer.service.js';
import { RendererService } from './renderer.service.js';
import { SeoProcessor } from './seo.processor.js';
import { SiteCrawlerService } from './site-crawler.service.js';
import { SiteAggregationProcessor } from './site-aggregation.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'seo-analysis' }, { name: 'site-aggregation' }),
  ],
  controllers: [SeoController],
  providers: [
    SeoService,
    SeoAnalyzerService,
    RendererService,
    SeoProcessor,
    SiteCrawlerService,
    SiteAggregationProcessor,
  ],
  exports: [SeoAnalyzerService, RendererService],
})
export class SeoModule {}