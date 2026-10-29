import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SeoService } from './seo.service.js';
import type { Viewer } from '../auth/viewer.service.js';

const OWNER: Viewer = { userId: 'user-1', guestSessionId: null, guestToken: null };
const GUEST: Viewer = { userId: null, guestSessionId: 'guest-1', guestToken: 'guest-token' };
const STRANGER: Viewer = { userId: 'user-2', guestSessionId: null, guestToken: null };

function makeService(
  prisma: unknown,
  extra: { viewerService?: unknown; crawler?: unknown; flowProducer?: unknown } = {},
) {
  const service = Object.create(SeoService.prototype) as SeoService;
  (service as unknown as { prisma: unknown }).prisma = prisma;
  (service as unknown as { viewerService: unknown }).viewerService = extra.viewerService ?? {
    canView: (scan: { userId?: string | null; guestSessionId?: string | null }, viewer: Viewer) => {
      if (scan.userId) return scan.userId === viewer.userId;
      if (scan.guestSessionId) return scan.guestSessionId === viewer.guestSessionId;
      return true;
    },
    ownerScope: (viewer: Viewer) =>
      viewer.userId ? { userId: viewer.userId } : viewer.guestSessionId ? { guestSessionId: viewer.guestSessionId } : null,
  };
  (service as unknown as { crawler: unknown }).crawler = extra.crawler ?? {};
  (service as unknown as { flowProducer: unknown }).flowProducer = extra.flowProducer ?? {};
  return service;
}

describe('SeoService.getScoreHistory', () => {
  it('groups scans from different Site rows that share the same normalised URL', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'current',
          userId: 'user-1',
          guestSessionId: null,
          site: { url: 'https://Example.com/' },
        }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'newer', createdAt: new Date('2026-01-02'), averageScore: 80, pageCount: 3 },
          { id: 'older', createdAt: new Date('2026-01-01'), averageScore: 70, pageCount: 5 },
        ]),
      },
      site: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'site-1', url: 'https://example.com' },
          { id: 'site-2', url: 'http://www.example.com/' },
          { id: 'site-3', url: 'https://other.com' },
        ]),
      },
    };

    const history = await makeService(prisma).getScoreHistory('current', OWNER);

    const where = prisma.siteScan.findMany.mock.calls[0][0].where;
    expect(where.siteId.in).toEqual(['site-1', 'site-2']);
    expect(where.status).toBe('completed');
    expect(where.pageCount).toEqual({ gt: 0 });
    expect(where.scans).toEqual({ some: {} });
    expect(history.points.map((p) => p.siteScanId)).toEqual(['older', 'newer']);
  });

  it('scopes a guest history to the same guest session', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'current',
          userId: null,
          guestSessionId: 'guest-1',
          site: { url: 'https://example.com' },
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      site: { findMany: vi.fn().mockResolvedValue([{ id: 'site-1', url: 'https://example.com' }]) },
    };

    await makeService(prisma).getScoreHistory('current', GUEST);

    const where = prisma.siteScan.findMany.mock.calls[0][0].where;
    expect(where.guestSessionId).toBe('guest-1');
    expect(where.userId).toBeUndefined();
  });

  it('hides history from a viewer who does not own the scan', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'current',
          userId: 'user-1',
          guestSessionId: null,
          site: { url: 'https://example.com' },
        }),
        findMany: vi.fn(),
      },
      site: { findMany: vi.fn() },
    };

    await expect(makeService(prisma).getScoreHistory('current', STRANGER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.siteScan.findMany).not.toHaveBeenCalled();
  });

  it('throws when the site scan does not exist', async () => {
    const prisma = {
      siteScan: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      site: { findMany: vi.fn() },
    };

    await expect(makeService(prisma).getScoreHistory('missing', OWNER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SeoService.enqueueSiteScan guest limit', () => {
  function basePrisma(previous: { id: string } | null) {
    return {
      siteScan: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(previous),
        create: vi.fn().mockResolvedValue({ id: 'scan-1' }),
      },
      site: { create: vi.fn().mockResolvedValue({ id: 'site-1' }) },
    };
  }

  it('blocks a guest whose earlier scan produced page results', async () => {
    const prisma = basePrisma({ id: 'previous-scan' });
    const service = makeService(prisma);

    await expect(service.enqueueSiteScan('https://example.com', GUEST)).rejects.toMatchObject({
      response: {
        code: 'GUEST_SCAN_LIMIT',
        siteScanId: 'previous-scan',
      },
    });

    const where = prisma.siteScan.findFirst.mock.calls[0][0].where;
    expect(where.guestSessionId).toBe('guest-1');
    expect(where.OR).toEqual([{ status: 'processing' }, { status: 'completed', scans: { some: {} } }]);
    expect(prisma.site.create).not.toHaveBeenCalled();
  });

  it('lets a guest scan again after a crawl where every page failed', async () => {
    const prisma = basePrisma(null);
    const crawler = { discoverPages: vi.fn().mockResolvedValue(['https://example.com']) };
    const flowProducer = { add: vi.fn().mockResolvedValue({ job: { id: 'job-1' } }) };
    const service = makeService(prisma, { crawler, flowProducer });

    const result = await service.enqueueSiteScan('https://example.com', GUEST);

    expect(result).toMatchObject({ siteScanId: 'scan-1', pagesQueued: 1 });
    expect(prisma.siteScan.create.mock.calls[0][0].data).toMatchObject({
      userId: null,
      guestSessionId: 'guest-1',
    });
    expect(flowProducer.add).toHaveBeenCalledTimes(1);
  });

  it('does not apply the guest limit to signed-in users', async () => {
    const prisma = basePrisma({ id: 'unused' });
    const crawler = { discoverPages: vi.fn().mockResolvedValue([]) };
    const flowProducer = { add: vi.fn().mockResolvedValue({ job: { id: 'job-1' } }) };
    const service = makeService(prisma, { crawler, flowProducer });

    await service.enqueueSiteScan('https://example.com', OWNER);

    expect(prisma.siteScan.findFirst).not.toHaveBeenCalled();
    expect(prisma.siteScan.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-1',
      guestSessionId: null,
    });
  });

  it('returns the in-flight scan for a repeated submission of the same URL', async () => {
    const prisma = {
      siteScan: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'live-scan', site: { url: 'https://Example.com/' } },
        ]),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      site: { create: vi.fn() },
    };
    const service = makeService(prisma);

    const result = await service.enqueueSiteScan('https://example.com', GUEST);

    expect(result).toEqual({ siteScanId: 'live-scan', pagesQueued: 0, deduped: true });
    expect(prisma.siteScan.findFirst).not.toHaveBeenCalled();
    expect(prisma.siteScan.create).not.toHaveBeenCalled();
  });
});

describe('SeoService.listSiteScans', () => {
  it('returns only owner-scoped scans with the successful page count', async () => {
    const prisma = {
      siteScan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'scan-1',
            status: 'completed',
            averageScore: 82,
            pageCount: 3,
            completedPages: 3,
            reportStatus: null,
            createdAt: new Date(),
            site: { id: 'site-1', url: 'https://example.com' },
            _count: { scans: 2 },
          },
        ]),
      },
    };
    const service = makeService(prisma);

    const scans = (await service.listSiteScans(OWNER)) as Array<Record<string, unknown>>;

    expect(prisma.siteScan.findMany.mock.calls[0][0].where).toEqual({ userId: 'user-1' });
    expect(scans[0]).toMatchObject({ id: 'scan-1', successfulPages: 2 });
    expect(scans[0]).not.toHaveProperty('_count');
  });

  it('scopes guests by guest session and returns nothing without any identity', async () => {
    const prisma = { siteScan: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = makeService(prisma);

    await service.listSiteScans(GUEST);
    expect(prisma.siteScan.findMany.mock.calls[0][0].where).toEqual({ guestSessionId: 'guest-1' });

    expect(await service.listSiteScans({ userId: null, guestSessionId: null, guestToken: null })).toEqual([]);
    expect(prisma.siteScan.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('SeoService.getSiteScan', () => {
  it('refuses to return another user’s scan', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'scan-1',
          userId: 'user-1',
          guestSessionId: null,
          status: 'completed',
          scans: [],
          progress: [],
        }),
      },
    };
    const service = makeService(prisma, {
      viewerService: {
        assertCanView: vi.fn(async (_id: string, viewer: Viewer) => {
          if (viewer.userId !== 'user-1') throw new NotFoundException('Site scan not found.');
        }),
      },
    });

    await expect(service.getSiteScan('scan-1', STRANGER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getSiteScan('scan-1', OWNER)).resolves.toMatchObject({ id: 'scan-1' });
  });

  it('never exposes owner identifiers in the response', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'scan-1',
          siteId: 'site-1',
          userId: 'user-1',
          guestSessionId: 'guest-1',
          status: 'completed',
          scans: [],
          progress: [],
        }),
      },
    };
    const service = makeService(prisma, { viewerService: { assertCanView: vi.fn(async () => undefined) } });

    const scan = (await service.getSiteScan('scan-1', OWNER)) as Record<string, unknown>;

    expect(scan).not.toHaveProperty('userId');
    expect(scan).not.toHaveProperty('guestSessionId');
  });
});
