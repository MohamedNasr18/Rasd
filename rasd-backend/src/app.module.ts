import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { SeoModule } from './seo/seo.module.js';
import { ReportModule } from './report/report.module.js';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    PrismaModule,
    SeoModule,
    ReportModule,
    ChatModule,
  ],
})
export class AppModule {}