import { describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { hashPassword } from './crypto.js';
import { GUEST_COOKIE, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, SESSION_COOKIE } from './auth.constants.js';

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'consumedAt' && value === null) return row.consumedAt == null;
    if (key === 'email') return row.email === value;
    if (key === 'id') return row.id === value;
    if (key === 'googleId') return row.googleId === value;
    if (key === 'userId') return row.userId === value;
    return true;
  });
}

function makePrisma() {
  const users: Row[] = [];
  const otps: Row[] = [];
  const sessions: Row[] = [];
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;

  const findUser = (where: Row): Row | null => {
    if (where.id) return users.find((u) => u.id === where.id) ?? null;
    if (where.email) return users.find((u) => u.email === where.email) ?? null;
    if (where.googleId) return users.find((u) => u.googleId === where.googleId) ?? null;
    return null;
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => findUser(where)),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const user = { id: id('user'), avatarUrl: null, googleId: null, emailVerifiedAt: null, ...data };
        users.push(user);
        return user;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const user = findUser(where);
        if (!user) throw new Error('user not found');
        Object.assign(user, data);
        return user;
      }),
    },
    emailOtp: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: id('otp'), attempts: 0, consumedAt: null, ...data };
        otps.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        let rows = otps.filter((row) => matchesWhere(row, where));
        if (orderBy?.lastSentAt === 'desc') {
          rows = [...rows].sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime());
        }
        return rows[0] ? { ...rows[0] } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = otps.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('otp not found');
        Object.assign(row, {
          ...data,
          attempts: data.attempts?.increment ? row.attempts + data.attempts.increment : row.attempts,
        });
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = otps.filter((row) => matchesWhere(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    session: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: id('session'), ...data };
        sessions.push(row);
        return row;
      }),
    },
    siteScan: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma, users, otps, sessions };
}

function makeService(overrides: { guestToken?: string; migrateRejects?: boolean } = {}) {
  const { prisma, users, otps, sessions } = makePrisma();
  const viewer = {
    migrateGuestScans: vi.fn(async () =>
      overrides.migrateRejects ? Promise.reject(new Error('db down')) : 1,
    ),
  };
  const mail = { sendOtp: vi.fn(async () => undefined) };
  const google = { verifyIdToken: vi.fn() };
  const rateLimit = { consume: vi.fn(() => true) };
  const service = new AuthService(prisma as never, viewer as never, mail as never, google as never, rateLimit as never);

  const req = {
    headers: { cookie: overrides.guestToken ? `${GUEST_COOKIE}=${overrides.guestToken}` : '' },
    ip: '127.0.0.1',
    socket: {},
  } as unknown as Request;
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;

  return { service, prisma, viewer, mail, google, rateLimit, users, otps, sessions, req, res };
}

const SIGNUP = { name: 'Sara', email: 'sara@example.com', password: 'Str0ngPass!23' };

describe('AuthService.signup', () => {
  it('stores a password hash, emails an OTP and never returns the code', async () => {
    const ctx = makeService();
    const result = await ctx.service.signup(SIGNUP, ctx.req);

    expect(result).toEqual({
      email: SIGNUP.email,
      requiresVerification: true,
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
    expect(result).not.toHaveProperty('code');

    const passwordHash = ctx.users[0].passwordHash;
    expect(passwordHash).not.toContain(SIGNUP.password);
    expect(passwordHash.startsWith('scrypt$')).toBe(true);

    const [email, code] = ctx.mail.sendOtp.mock.calls[0];
    expect(email).toBe(SIGNUP.email);
    expect(code).toMatch(/^\d{6}$/);
    expect(ctx.otps[0].codeHash).not.toContain(code);
  });

  it('rejects an already verified email without creating a duplicate', async () => {
    const ctx = makeService();
    await ctx.prisma.user.create({ data: { ...SIGNUP, emailVerifiedAt: new Date() } });

    await expect(ctx.service.signup(SIGNUP, ctx.req)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.users).toHaveLength(1);
  });

  it('reuses the unverified account instead of creating a second one', async () => {
    const ctx = makeService();
    await ctx.prisma.user.create({ data: { ...SIGNUP, emailVerifiedAt: null } });

    await ctx.service.signup({ ...SIGNUP, password: 'AnotherPass!456' }, ctx.req);

    expect(ctx.users).toHaveLength(1);
    expect(ctx.users[0].passwordHash).not.toContain('AnotherPass!456');
  });
});

describe('AuthService.verifyOtp', () => {
  async function signupAndReadCode() {
    const ctx = makeService({ guestToken: 'guest-token' });
    await ctx.service.signup(SIGNUP, ctx.req);
    const code = ctx.mail.sendOtp.mock.calls[0][1] as string;
    return { ...ctx, code };
  }

  it('rejects a wrong code and counts the attempt', async () => {
    const ctx = await signupAndReadCode();

    await expect(
      ctx.service.verifyOtp({ email: SIGNUP.email, code: '000000' }, ctx.req, ctx.res),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_CODE', attemptsRemaining: OTP_MAX_ATTEMPTS - 1 },
    });
    expect(ctx.otps[0].attempts).toBe(1);
    expect(ctx.sessions).toHaveLength(0);
  });

  it('rejects an expired OTP', async () => {
    const ctx = await signupAndReadCode();
    ctx.otps[0].expiresAt = new Date(Date.now() - 1000);

    await expect(
      ctx.service.verifyOtp({ email: SIGNUP.email, code: ctx.code }, ctx.req, ctx.res),
    ).rejects.toMatchObject({ response: { code: 'OTP_EXPIRED' } });
  });

  it('rejects once the attempt budget is exhausted', async () => {
    const ctx = await signupAndReadCode();
    ctx.otps[0].attempts = OTP_MAX_ATTEMPTS;

    await expect(
      ctx.service.verifyOtp({ email: SIGNUP.email, code: ctx.code }, ctx.req, ctx.res),
    ).rejects.toMatchObject({ response: { code: 'TOO_MANY_ATTEMPTS' } });
  });

  it('consumes the OTP, creates a session, migrates the guest scan and clears the guest cookie', async () => {
    const ctx = await signupAndReadCode();

    const result = await ctx.service.verifyOtp({ email: SIGNUP.email, code: ctx.code }, ctx.req, ctx.res);

    expect(result.user.email).toBe(SIGNUP.email);
    expect(result.user.emailVerified).toBe(true);
    expect(result.migratedGuestScans).toBe(1);
    expect(ctx.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(ctx.otps[0].consumedAt).toBeInstanceOf(Date);

    expect(ctx.sessions).toHaveLength(1);
    const storedHash = ctx.sessions[0].tokenHash as string;
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);

    const [cookieName, cookieValue] = ctx.res.cookie.mock.calls[0];
    expect(cookieName).toBe(SESSION_COOKIE);
    expect(cookieValue).not.toBe(storedHash);
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(GUEST_COOKIE, expect.anything());
  });
});

describe('AuthService.login', () => {
  async function verifiedUser(password: string) {
    const ctx = makeService();
    await ctx.prisma.user.create({
      data: {
        name: 'Sara',
        email: SIGNUP.email,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });
    return ctx;
  }

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const ctx = await verifiedUser('Str0ngPass!23');

    await expect(
      ctx.service.login({ email: SIGNUP.email, password: 'nope' }, ctx.req, ctx.res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.sessions).toHaveLength(0);
  });

  it('rejects unverified accounts with EMAIL_NOT_VERIFIED', async () => {
    const ctx = makeService();
    await ctx.prisma.user.create({
      data: { name: 'Sara', email: SIGNUP.email, passwordHash: await hashPassword('Str0ngPass!23') },
    });

    await expect(
      ctx.service.login({ email: SIGNUP.email, password: 'Str0ngPass!23' }, ctx.req, ctx.res),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.sessions).toHaveLength(0);
  });

  it('creates a session for verified credentials', async () => {
    const ctx = await verifiedUser('Str0ngPass!23');

    const result = await ctx.service.login({ email: SIGNUP.email, password: 'Str0ngPass!23' }, ctx.req, ctx.res);

    expect(result.user.email).toBe(SIGNUP.email);
    expect(ctx.sessions).toHaveLength(1);
    expect(ctx.res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.any(String), expect.anything());
  });

  it('keeps the session but reports pending migration when the guest move fails', async () => {
    const ctx = makeService({ guestToken: 'guest-token', migrateRejects: true });
    await ctx.prisma.user.create({
      data: {
        name: 'Sara',
        email: SIGNUP.email,
        passwordHash: await hashPassword('Str0ngPass!23'),
        emailVerifiedAt: new Date(),
      },
    });

    const result = await ctx.service.login({ email: SIGNUP.email, password: 'Str0ngPass!23' }, ctx.req, ctx.res);

    expect(result.guestMigrationPending).toBe(true);
    expect(ctx.sessions).toHaveLength(1);
    expect(ctx.res.clearCookie).not.toHaveBeenCalledWith(GUEST_COOKIE, expect.anything());
  });
});

describe('AuthService.signInWithGoogle', () => {
  const PROFILE = { googleId: 'google-1', email: 'sara@gmail.com', name: 'Sara', avatarUrl: 'https://img/1.png' };

  it('creates a verified account on first sign-in', async () => {
    const ctx = makeService();
    ctx.google.verifyIdToken.mockResolvedValue(PROFILE);

    const result = await ctx.service.signInWithGoogle({ idToken: 'x'.repeat(40) }, ctx.req, ctx.res);

    expect(result.user.email).toBe(PROFILE.email);
    expect(ctx.users[0].googleId).toBe(PROFILE.googleId);
    expect(ctx.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(ctx.sessions).toHaveLength(1);
  });

  it('links an existing email account instead of duplicating it', async () => {
    const ctx = makeService();
    await ctx.prisma.user.create({
      data: { name: 'Sara', email: PROFILE.email, passwordHash: await hashPassword('Str0ngPass!23') },
    });
    ctx.google.verifyIdToken.mockResolvedValue(PROFILE);

    await ctx.service.signInWithGoogle({ idToken: 'x'.repeat(40) }, ctx.req, ctx.res);

    expect(ctx.users).toHaveLength(1);
    expect(ctx.users[0].googleId).toBe(PROFILE.googleId);
    expect(ctx.users[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('refuses to relink an email already tied to another Google account', async () => {
    const ctx = makeService();
    await ctx.prisma.user.create({
      data: { name: 'Sara', email: PROFILE.email, googleId: 'google-other', emailVerifiedAt: new Date() },
    });
    ctx.google.verifyIdToken.mockResolvedValue(PROFILE);

    await expect(
      ctx.service.signInWithGoogle({ idToken: 'x'.repeat(40) }, ctx.req, ctx.res),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.sessions).toHaveLength(0);
  });
});

describe('AuthService.migrateGuest / logout / rate limiting', () => {
  it('requires a session before migrating a guest scan', async () => {
    const ctx = makeService({ guestToken: 'guest-token' });

    await expect(
      ctx.service.migrateGuest(
        ctx.req,
        ctx.res,
        { userId: null, guestSessionId: 'guest-1', guestToken: 'guest-token' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.viewer.migrateGuestScans).not.toHaveBeenCalled();
  });

  it('migrates and clears the guest cookie for a signed-in viewer', async () => {
    const ctx = makeService({ guestToken: 'guest-token' });

    const result = await ctx.service.migrateGuest(
      ctx.req,
      ctx.res,
      { userId: 'user-1', guestSessionId: 'guest-1', guestToken: 'guest-token' },
    );

    expect(result).toEqual({ migrated: 1 });
    expect(ctx.viewer.migrateGuestScans).toHaveBeenCalledWith('guest-token', 'user-1');
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(GUEST_COOKIE, expect.anything());
  });

  it('deletes the stored session hash and clears the cookie on logout', async () => {
    const ctx = makeService();
    const prisma = ctx.prisma as unknown as { session: { deleteMany: ReturnType<typeof vi.fn> } };
    (prisma.session as any).deleteMany = vi.fn(async () => ({ count: 1 }));
    const req = { headers: { cookie: `${SESSION_COOKIE}=raw-token` }, ip: '127.0.0.1', socket: {} } as unknown as Request;

    await ctx.service.logout(req, ctx.res);

    const where = (prisma.session.deleteMany as any).mock.calls[0][0].where;
    expect(where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(where.tokenHash).not.toContain('raw-token');
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.anything());
  });

  it('returns RATE_LIMITED when the limiter rejects', async () => {
    const ctx = makeService();
    ctx.rateLimit.consume.mockReturnValue(false);

    await expect(ctx.service.signup(SIGNUP, ctx.req)).rejects.toBeInstanceOf(HttpException);
    await expect(ctx.service.signup(SIGNUP, ctx.req)).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });
});
