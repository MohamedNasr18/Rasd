import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST is not configured — verification codes are printed to this console (development only).');
      return;
    }
    const port = Number(process.env.SMTP_PORT) || 587;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }

  get configured(): boolean {
    return this.transporter !== null;
  }

  async sendOtp(email: string, code: string, name: string, ttlMinutes: number): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[dev] Verification code for ${email}: ${code} (valid ${ttlMinutes} minutes)`);
      return;
    }

    const from = process.env.SMTP_FROM ?? 'Rasd <no-reply@rasd.app>';
    const text = [
      `مرحبًا ${name}،`,
      '',
      `رمز التحقق الخاص بك في رصد هو: ${code}`,
      `الرمز صالح لمدة ${ttlMinutes} دقائق. لو ما طلبتش الرمز، تجاهل الرسالة دي.`,
      '',
      `Hello ${name},`,
      `Your Rasd verification code is: ${code}`,
      `The code is valid for ${ttlMinutes} minutes. If you did not request it, ignore this email.`,
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: 'رمز التحقق - رصد | Rasd verification code',
        text,
        html: `
          <div style="font-family:system-ui,Segoe UI,Tahoma,sans-serif;line-height:1.7;color:#111827">
            <p>مرحبًا ${escapeHtml(name)}،</p>
            <p>رمز التحقق الخاص بك في رصد:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
            <p style="color:#6b7280;font-size:13px">الرمز صالح لمدة ${ttlMinutes} دقائق. لو ما طلبتش الرمز، تجاهل الرسالة دي.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
            <p>Hello ${escapeHtml(name)},</p>
            <p>Your Rasd verification code:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
            <p style="color:#6b7280;font-size:13px">The code is valid for ${ttlMinutes} minutes. If you did not request it, ignore this email.</p>
          </div>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${email}: ${(err as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'Could not send the verification email. Please try again shortly.',
      });
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
