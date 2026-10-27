import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatAgentService } from './chat-agent.service.js';
import { KnowledgeBaseService } from './knowledge-base.service.js';
import { SeoModule } from '../seo/seo.module.js';
import { ReportModule } from '../report/report.module.js';

@Module({
  imports: [SeoModule, ReportModule], 
  controllers: [ChatController],
  providers: [ChatService, ChatAgentService, KnowledgeBaseService],
})
export class ChatModule {}