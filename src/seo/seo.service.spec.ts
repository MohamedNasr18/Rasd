import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SeoService } from './seo.service.js';

function makeService(prisma: unknown) {
  // Bypass the constructor: it opens a BullMQ Redis connection we don't need.
  const service = Object.create(SeoService.prototype) as SeoService;
  (service as unknown as { prisma: unknown }).prisma = prisma;
  return service;
}

describe('SeoService.getScoreHistory', () => {
  it('groups scans from different Site rows that share the same normalised URL', async () => {
    const prisma = {
      siteScan: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'current',
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

    const history = await makeService(prisma).getScoreHistory('current');

    const where = prisma.siteScan.findMany.mock.calls[0][0].where;
    expect(where.siteId.in).toEqual(['site-1', 'site-2']);
    expect(where.status).toBe('completed');
    expect(where.pageCount).toEqual({ gt: 0 });
    expect(history.points.map((p) => p.siteScanId)).toEqual(['older', 'newer']);
  });

  it('throws when the site scan does not exist', async () => {
    const prisma = {
      siteScan: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      site: { findMany: vi.fn() },
    };

    await expect(makeService(prisma).getScoreHistory('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
