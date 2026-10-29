import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ChatService } from './chat.service.js';
import { toLanguage } from '../common/language.js';
import { ViewerService } from '../auth/viewer.service.js';

class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';
}

@Controller('site-scan/:siteScanId/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly viewerService: ViewerService,
  ) {}

  @Post()
  async send(
    @Param('siteScanId') siteScanId: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    const viewer = await this.viewerService.resolve(req);
    await this.viewerService.assertCanView(siteScanId, viewer);
    if (dto.conversationId) {
      await this.viewerService.assertCanViewConversation(dto.conversationId, viewer);
    }
    return this.chatService.sendMessage(
      siteScanId,
      dto.message,
      dto.conversationId,
      toLanguage(dto.lang),
    );
  }

  @Get(':conversationId/history')
  async history(
    @Param('siteScanId') siteScanId: string,
    @Param('conversationId') conversationId: string,
    @Req() req: Request,
  ) {
    const viewer = await this.viewerService.resolve(req);
    await this.viewerService.assertCanView(siteScanId, viewer);
    await this.viewerService.assertCanViewConversation(conversationId, viewer);
    return this.chatService.getHistory(conversationId);
  }
}
