import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatAgentService } from './chat-agent.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { SeoModule } from '../seo/seo.module.js';
import { ReportModule } from '../report/report.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [SeoModule, ReportModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatAgentService, KnowledgeBaseService],
})
export class ChatModule {}