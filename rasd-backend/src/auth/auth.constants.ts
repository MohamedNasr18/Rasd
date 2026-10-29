export const SESSION_COOKIE = 'rasd_session';
export const GUEST_COOKIE = 'rasd_guest';

export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS) || 30;
export const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 10;
export const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60;
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
export const GUEST_RETRY_DEDUPE_MS = 10 * 60 * 1000;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
