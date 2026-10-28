import { ReportAggregatorService } from './report-aggregator.service.js';

function serviceWith(results: unknown[]) {
  const prisma = {
    siteScan: {
      findUniqueOrThrow: async () => ({
        id: 'site-scan',
        averageScore: 70,
        pageCount: 1,
        siteLevelResults: [],
        site: { url: 'https://example.com' },
        scans: [{ url: 'https://example.com/', results }],
      }),
    },
  };
  return new ReportAggregatorService(prisma as never);
}

describe('ReportAggregatorService', () => {
  it('treats a numeric `missing` detail (image alt count) as a count, not a metric list', async () => {
    const service = serviceWith([
      { check: 'image_alt_tags', status: 'warning', message: '2 images without alt.', weight: 1, details: { total: 4, missing: 2 } },
    ]);

    const context = await service.buildContext('site-scan', 'en');

    const check = context.aggregatedChecks.find((c) => c.check === 'image_alt_tags');
    expect(check?.warningCount).toBe(1);
    expect(check?.unmeasured).toEqual({});
    expect(context.issues[0].unmeasured).toEqual([]);
  });

  it('keeps CWV metric keys as the unmeasured list', async () => {
    const service = serviceWith([
      { check: 'core_web_vitals', status: 'warning', message: 'INP not measured.', weight: 3, details: { metrics: [], missing: ['inp'] } },
    ]);

    const context = await service.buildContext('site-scan', 'en');

    expect(context.aggregatedChecks[0].unmeasured).toEqual({ inp: 1 });
  });
});
