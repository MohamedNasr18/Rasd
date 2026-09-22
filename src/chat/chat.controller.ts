import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ChatService } from './chat.service.js';

class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

@Controller('site-scan/:siteScanId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async send(@Param('siteScanId') siteScanId: string, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(siteScanId, dto.message, dto.conversationId);
  }

  @Get(':conversationId/history')
  async history(@Param('conversationId') conversationId: string) {
    return this.chatService.getHistory(conversationId);
  }
}