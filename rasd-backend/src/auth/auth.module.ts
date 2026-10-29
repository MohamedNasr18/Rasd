import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleService } from './google.service.js';
import { MailService } from './mail.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { ViewerService } from './viewer.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, ViewerService, MailService, GoogleService, RateLimitService],
  exports: [ViewerService, AuthService, GoogleService, RateLimitService],
})
export class AuthModule {}
