import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey = process.env.BREVO_API_KEY;

  get configured(): boolean {
    return !!this.apiKey;
  }

  async sendOtp(email: string, code: string, name: string, ttlMinutes: number): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`[dev] Verification code for ${email}: ${code} (valid ${ttlMinutes} minutes)`);
      return;
    }

    const senderEmail = process.env.MAIL_FROM_EMAIL!;
    const senderName = process.env.MAIL_FROM_NAME ?? 'Rasd';

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

    const html = `
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
      </div>`;

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email, name }],
          subject: 'رمز التحقق - رصد | Rasd verification code',
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`Brevo ${res.status}: ${await res.text()}`);
      }
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