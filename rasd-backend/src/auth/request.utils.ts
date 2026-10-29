import type { Request, Response } from 'express';
import { COOKIE_OPTIONS, GUEST_COOKIE, SESSION_COOKIE } from './auth.constants.js';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export function setSessionCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

export function setGuestCookie(res: Response, token: string) {
  res.cookie(GUEST_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 365 * 24 * 60 * 60 * 1000 });
}

export function clearGuestCookie(res: Response) {
  res.clearCookie(GUEST_COOKIE, COOKIE_OPTIONS);
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
