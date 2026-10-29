import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly client = new OAuth2Client();

  get configured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID);
  }

  get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID ?? '';
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Google sign-in is not configured on the server.',
      });
    }

    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException({ code: 'GOOGLE_TOKEN_INVALID', message: 'Google token is missing an email.' });
      }
      if (!payload.email_verified) {
        throw new UnauthorizedException({
          code: 'GOOGLE_EMAIL_UNVERIFIED',
          message: 'Google has not verified this email address.',
        });
      }
      const email = payload.email.toLowerCase();
      return {
        googleId: payload.sub,
        email,
        name: payload.name?.trim() || email.split('@')[0],
        avatarUrl: payload.picture ?? null,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`Google token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException({ code: 'GOOGLE_TOKEN_INVALID', message: 'Google sign-in could not be verified.' });
    }
  }
}
