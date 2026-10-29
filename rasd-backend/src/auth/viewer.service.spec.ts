import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ViewerService, type Viewer } from './viewer.service.js';
import { GUEST_COOKIE, SESSION_COOKIE } from './auth.constants.js';
import { hashToken } from './crypto.js';

const OWNER: Viewer = { userId: 'user-1', guestSessionId: null, guestToken: null };
const GUEST: Viewer = { userId: null, guestSessionId: 'guest-1', guestToken: 'guest-token' };
const STRANGER: Viewer = { userId: 'user-2', guestSessionId: null, guestToken: null };
const ANON: Viewer = { userId: null, guestSessionId: null, guestToken: null };

function req(cookie: string): Request {
  return { headers: { cookie }, ip: '127.0.0.1', socket: {} } as unknown as Request;
}

describe('ViewerService.canView', () => {
  const service = new ViewerService({} as never);

  it('allows the owning user and rejects other users', () => {
    const scan = { userId: 'user-1', guestSessionId: null };
    expect(service.canView(scan, OWNER)).toBe(true);
    expect(service.canView(scan, STRANGER)).toBe(false);
    expect(service.canView(scan, ANON)).toBe(false);
  });

  it('allows the matching guest session and rejects other guests', () => {
    const scan = { userId: null, guestSessionId: 'guest-1' };
    expect(service.canView(scan, GUEST)).toBe(true);
    expect(service.canView(scan, { ...GUEST, guestSessionId: 'guest-2' })).toBe(false);
    expect(service.canView(scan, ANON)).toBe(false);
  });

  it('keeps unowned legacy scans readable', () => {
    expect(service.canView({ userId: null, guestSessionId: null }, ANON)).toBe(true);
  });
});

describe('ViewerService.ownerScope', () => {
  const service = new ViewerService({} as never);

  it('scopes to the user, then the guest session, then nothing', () => {
    expect(service.ownerScope(OWNER)).toEqual({ userId: 'user-1' });
    expect(service.ownerScope(GUEST)).toEqual({ guestSessionId: 'guest-1' });
    expect(service.ownerScope(ANON)).toBeNull();
  });
});

describe('ViewerService.assertCanView', () => {
  it('returns 404 for missing or foreign scans alike', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'foreign' ? { userId: 'user-1', guestSessionId: null } : null,
        ),
      },
    };
    const service = new ViewerService(prisma as never);

    await expect(service.assertCanView('missing', OWNER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertCanView('foreign', STRANGER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertCanView('foreign', OWNER)).resolves.toBeUndefined();
  });

  it('walks the conversation up to its site scan', async () => {
    const prisma = {
      conversation: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'conv-1'
            ? { siteScan: { userId: null, guestSessionId: 'guest-1' } }
            : null,
        ),
      },
    };
    const service = new ViewerService(prisma as never);

    await expect(service.assertCanViewConversation('conv-1', GUEST)).resolves.toBeUndefined();
    await expect(service.assertCanViewConversation('conv-1', ANON)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.assertCanViewConversation('conv-2', GUEST)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ViewerService.resolve', () => {
  it('resolves a valid session and guest session from hashed cookies', async () => {
    const prisma = {
      session: {
        findUnique: vi.fn(async () => ({ userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) })),
        deleteMany: vi.fn(),
      },
      guestSession: { findUnique: vi.fn(async () => ({ id: 'guest-1' })) },
    };
    const service = new ViewerService(prisma as never);

    const viewer = await service.resolve(req(`${SESSION_COOKIE}=raw-session; ${GUEST_COOKIE}=raw-guest`));

    expect(viewer).toEqual({ userId: 'user-1', guestSessionId: 'guest-1', guestToken: 'raw-guest' });
    const sessionLookup = prisma.session.findUnique.mock.calls[0][0].where.tokenHash;
    expect(sessionLookup).toBe(hashToken('raw-session'));
    expect(sessionLookup).not.toContain('raw-session');
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes expired sessions and treats them as anonymous', async () => {
    const prisma = {
      session: {
        findUnique: vi.fn(async () => ({ userId: 'user-1', expiresAt: new Date(Date.now() - 1000) })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      guestSession: { findUnique: vi.fn() },
    };
    const service = new ViewerService(prisma as never);

    const viewer = await service.resolve(req(`${SESSION_COOKIE}=expired`));

    expect(viewer.userId).toBeNull();
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe('ViewerService.ensureGuestSession', () => {
  it('reuses an existing guest row without setting a new cookie', async () => {
    const prisma = { guestSession: { findUnique: vi.fn(async () => ({ id: 'guest-1' })), create: vi.fn() } };
    const service = new ViewerService(prisma as never);
    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;

    const id = await service.ensureGuestSession(req(`${GUEST_COOKIE}=existing`), res);

    expect(id).toBe('guest-1');
    expect(prisma.guestSession.create).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('creates a guest row and stores only its hash', async () => {
    const prisma = {
      guestSession: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: { tokenHash: string } }) => ({ id: 'guest-new', ...data })),
      },
    };
    const service = new ViewerService(prisma as never);
    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;

    const id = await service.ensureGuestSession(req(''), res);

    expect(id).toBe('guest-new');
    const [name, rawToken] = (res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe(GUEST_COOKIE);
    const storedHash = prisma.guestSession.create.mock.calls[0][0].data.tokenHash;
    expect(storedHash).toBe(hashToken(rawToken));
    expect(storedHash).not.toContain(rawToken);
  });
});

describe('ViewerService.migrateGuestScans', () => {
  it('moves scans by guest session id and records the migration', async () => {
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const guestUpdate = vi.fn(async () => ({ id: 'guest-1' }));
    const prisma = {
      guestSession: { findUnique: vi.fn(async () => ({ id: 'guest-1' })), update: guestUpdate },
      siteScan: { updateMany },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new ViewerService(prisma as never);

    const migrated = await service.migrateGuestScans('raw-guest', 'user-1');

    expect(migrated).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { guestSessionId: 'guest-1', userId: null },
      data: { userId: 'user-1', guestSessionId: null },
    });
    expect(guestUpdate).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      data: { migratedToId: 'user-1' },
    });
  });

  it('is a no-op for missing tokens or unknown guest sessions', async () => {
    const prisma = {
      guestSession: { findUnique: vi.fn(async () => null), update: vi.fn() },
      siteScan: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    const service = new ViewerService(prisma as never);

    await expect(service.migrateGuestScans(null, 'user-1')).resolves.toBe(0);
    await expect(service.migrateGuestScans('unknown', 'user-1')).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stays idempotent when retried after a successful move', async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const prisma = {
      guestSession: { findUnique: vi.fn(async () => ({ id: 'guest-1' })), update: vi.fn(async () => ({})) },
      siteScan: { updateMany },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new ViewerService(prisma as never);

    await expect(service.migrateGuestScans('raw-guest', 'user-1')).resolves.toBe(0);
    expect(updateMany.mock.calls[0][0].where).toEqual({ guestSessionId: 'guest-1', userId: null });
  });
});
