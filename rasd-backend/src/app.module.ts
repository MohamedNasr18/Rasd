import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SeoModule } from './seo/seo.module.js';
import { ReportModule } from './report/report.module.js';
import { ChatModule } from './chat/chat.module.js';
import { redisConnection } from './redis-connection.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnection(),
    }),
    PrismaModule,
    AuthModule,
    SeoModule,
    ReportModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
