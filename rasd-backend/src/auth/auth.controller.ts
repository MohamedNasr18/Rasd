import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { GoogleService } from './google.service.js';
import { ViewerService } from './viewer.service.js';
import {
  GoogleSignInDto,
  LoginDto,
  ResendOtpDto,
  SignupDto,
  VerifyOtpDto,
} from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly viewer: ViewerService,
    private readonly google: GoogleService,
  ) {}

  @Post('signup')
  signup(@Body() dto: SignupDto, @Req() req: Request) {
    return this.auth.signup(dto, req);
  }

  @Post('verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.verifyOtp(dto, req, res);
  }

  @Post('resend-otp')
  @HttpCode(200)
  resendOtp(@Body() dto: ResendOtpDto, @Req() req: Request) {
    return this.auth.resendOtp(dto, req);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, req, res);
  }

  @Post('google')
  @HttpCode(200)
  googleSignIn(
    @Body() dto: GoogleSignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.signInWithGoogle(dto, req, res);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Get('me')
  async me(@Req() req: Request) {
    return this.auth.me(await this.viewer.resolve(req));
  }

  @Post('migrate-guest')
  @HttpCode(200)
  async migrateGuest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.migrateGuest(req, res, await this.viewer.resolve(req));
  }

  @Get('config')
  config() {
    return { googleClientId: this.google.configured ? this.google.clientId : null };
  }
}
