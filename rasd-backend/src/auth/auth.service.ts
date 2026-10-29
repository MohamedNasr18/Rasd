import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoogleService, type GoogleProfile } from './google.service.js';
import { MailService } from './mail.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { ViewerService, type Viewer } from './viewer.service.js';
import {
  GUEST_COOKIE,
  SESSION_COOKIE,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  SESSION_TTL_DAYS,
} from './auth.constants.js';
import { generateOtp, generateToken, hashOtp, hashPassword, hashToken, otpMatches, verifyPassword } from './crypto.js';
import { clientIp, getCookie, clearGuestCookie, clearSessionCookie, setSessionCookie } from './request.utils.js';
import type { GoogleSignInDto, LoginDto, ResendOtpDto, SignupDto, VerifyOtpDto } from './dto/auth.dto.js';

const HOUR = 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: true;
}

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: true,
  };
}

function apiError(status: HttpStatus, code: string, message: string, extra: Record<string, unknown> = {}) {
  return new HttpException({ code, message, ...extra }, status);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly viewer: ViewerService,
    private readonly mail: MailService,
    private readonly google: GoogleService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async signup(dto: SignupDto, req: Request) {
    this.limit(`signup:${clientIp(req)}`, 10, HOUR);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing?.emailVerifiedAt) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(dto.password);
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { name: dto.name, passwordHash },
        })
      : await this.prisma.user.create({
          data: { name: dto.name, email: dto.email, passwordHash },
        });

    await this.issueOtp(user);
    return {
      email: user.email,
      requiresVerification: true,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  async verifyOtp(dto: VerifyOtpDto, req: Request, res: Response) {
    this.limit(`verify:${clientIp(req)}:${dto.email}`, 20, QUARTER_HOUR);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'That verification code is not valid.');
    }

    const otp = await this.prisma.emailOtp.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { lastSentAt: 'desc' },
    });
    if (!otp) {
      throw apiError(HttpStatus.BAD_REQUEST, 'OTP_EXPIRED', 'The verification code has expired. Request a new one.');
    }
    if (otp.expiresAt <= new Date()) {
      throw apiError(HttpStatus.BAD_REQUEST, 'OTP_EXPIRED', 'The verification code has expired. Request a new one.');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
    }

    if (!otpMatches(user.id, dto.code, otp.codeHash)) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1));
      throw apiError(HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'That verification code is not valid.', {
        attemptsRemaining: remaining,
      });
    }

    const verifiedAt = user.emailVerifiedAt ?? new Date();
    await this.prisma.$transaction([
      this.prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: verifiedAt } }),
    ]);

    return this.finishAuth({ ...user, emailVerifiedAt: verifiedAt }, req, res);
  }

  async resendOtp(dto: ResendOtpDto, req: Request) {
    this.limit(`resend:${clientIp(req)}`, 10, QUARTER_HOUR);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      return { sent: true, resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException({ code: 'ALREADY_VERIFIED', message: 'This email is already verified.' });
    }

    const latest = await this.prisma.emailOtp.findFirst({
      where: { userId: user.id },
      orderBy: { lastSentAt: 'desc' },
      select: { lastSentAt: true },
    });
    if (latest) {
      const elapsed = (Date.now() - latest.lastSentAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        const retryAfterSeconds = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed);
        throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'RESEND_COOLDOWN', 'Please wait before requesting another code.', {
          retryAfterSeconds,
        });
      }
    }

    await this.issueOtp(user);
    return { sent: true, resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  async login(dto: LoginDto, req: Request, res: Response) {
    this.limit(`login:${clientIp(req)}:${dto.email}`, 10, QUARTER_HOUR);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordOk = user?.passwordHash ? await verifyPassword(dto.password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email before signing in.',
        email: user.email,
      });
    }

    return this.finishAuth(user, req, res);
  }

  async signInWithGoogle(dto: GoogleSignInDto, req: Request, res: Response) {
    this.limit(`google:${clientIp(req)}`, 20, QUARTER_HOUR);

    const profile = await this.google.verifyIdToken(dto.idToken);
    const user = await this.linkOrCreateGoogleUser(profile);
    return this.finishAuth(user, req, res);
  }

  async logout(req: Request, res: Response) {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    clearSessionCookie(res);
    return { ok: true };
  }

  async me(viewer: Viewer) {
    if (!viewer.userId) return { user: null, guestScanPending: false };

    const user = await this.prisma.user.findUnique({ where: { id: viewer.userId } });
    if (!user) return { user: null, guestScanPending: false };

    const guestScanPending = viewer.guestSessionId
      ? (await this.prisma.siteScan.count({ where: { guestSessionId: viewer.guestSessionId } })) > 0
      : false;

    return { user: publicUser(user), guestScanPending };
  }

  async migrateGuest(req: Request, res: Response, viewer: Viewer) {
    if (!viewer.userId) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to attach this scan to your account.' });
    }
    const guestToken = getCookie(req, GUEST_COOKIE);
    const migrated = await this.viewer.migrateGuestScans(guestToken ?? null, viewer.userId);
    clearGuestCookie(res);
    return { migrated };
  }

  private async linkOrCreateGoogleUser(profile: GoogleProfile): Promise<User> {
    const byGoogleId = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (byGoogleId) return byGoogleId;

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
        throw new ConflictException({
          code: 'ACCOUNT_LINK_CONFLICT',
          message: 'This email is already linked to a different Google account.',
        });
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: new Date(),
      },
    });
  }

  private async issueOtp(user: User): Promise<void> {
    const code = generateOtp();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.emailOtp.create({
        data: {
          userId: user.id,
          codeHash: hashOtp(user.id, code),
          expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
          lastSentAt: now,
        },
      }),
    ]);
    await this.mail.sendOtp(user.email, code, user.name, OTP_TTL_MINUTES);
  }

  private async finishAuth(user: User, req: Request, res: Response) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * HOUR);
    await this.prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
    setSessionCookie(res, token, SESSION_TTL_DAYS * 24 * HOUR);

    const guestToken = getCookie(req, GUEST_COOKIE);
    let migratedGuestScans = 0;
    let guestMigrationPending = false;
    if (guestToken) {
      try {
        migratedGuestScans = await this.viewer.migrateGuestScans(guestToken, user.id);
        clearGuestCookie(res);
      } catch (err) {
        guestMigrationPending = true;
        this.logger.warn(`Guest scan migration failed for user ${user.id}: ${(err as Error).message}`);
      }
    }

    return { user: publicUser(user), migratedGuestScans, guestMigrationPending };
  }

  private limit(key: string, max: number, windowMs: number): void {
    if (!this.rateLimit.consume(key, max, windowMs)) {
      throw apiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    }
  }
}
