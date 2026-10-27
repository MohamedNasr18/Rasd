import { describe, it, expect } from 'vitest';
import {
  rateCwv,
  cwvStatus,
  parseSitemapXml,
  formatCwvMetric,
  type CwvMetric,
} from './seo-analyzer.service.js';

const metric = (key: 'lcp' | 'inp' | 'cls', value: number, source: 'lab' | 'field'): CwvMetric => ({
  key,
  value,
  unit: key === 'cls' ? '' : 'ms',
  source,
  rating: rateCwv(key, value),
});

describe('rateCwv', () => {
  it('uses Google three-band thresholds instead of a single cutoff', () => {
    expect(rateCwv('lcp', 2500)).toBe('good');
    expect(rateCwv('lcp', 2501)).toBe('needs-improvement');
    expect(rateCwv('lcp', 4001)).toBe('poor');

    expect(rateCwv('inp', 200)).toBe('good');
    expect(rateCwv('inp', 350)).toBe('needs-improvement');
    expect(rateCwv('inp', 501)).toBe('poor');

    expect(rateCwv('cls', 0.1)).toBe('good');
    expect(rateCwv('cls', 0.11)).toBe('needs-improvement');
    expect(rateCwv('cls', 0.26)).toBe('poor');
  });
});

describe('cwvStatus', () => {
  it('never passes a check that was not fully measured', () => {
    const status = cwvStatus([metric('lcp', 1800, 'lab'), metric('cls', 0.05, 'lab')], ['inp']);
    expect(status).toBe('unknown');
  });

  it('passes only when all three metrics are good', () => {
    const status = cwvStatus(
      [metric('lcp', 1800, 'field'), metric('inp', 120, 'field'), metric('cls', 0.05, 'field')],
      [],
    );
    expect(status).toBe('pass');
  });

  it('fails when one metric is poor, even if another is missing', () => {
    const status = cwvStatus([metric('lcp', 11000, 'lab')], ['inp', 'cls']);
    expect(status).toBe('fail');
  });

  it('warns on needs-improvement', () => {
    const status = cwvStatus([metric('lcp', 3200, 'lab'), metric('inp', 150, 'field')], ['cls']);
    expect(status).toBe('warning');
  });
});

describe('formatCwvMetric', () => {
  it('shows the measured value with its source and rating', () => {
    expect(formatCwvMetric(metric('lcp', 11200, 'field'))).toBe('LCP 11.2s (field, poor)');
    expect(formatCwvMetric(metric('inp', 350, 'field'))).toBe('INP 350ms (field, needs-improvement)');
    expect(formatCwvMetric(metric('cls', 0.04, 'lab'))).toBe('CLS 0.04 (lab, good)');
  });
});

describe('parseSitemapXml', () => {
  it('reads a regular urlset', () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`;
    const parsed = parseSitemapXml(xml);
    expect(parsed.kind).toBe('urlset');
    expect(parsed.urls).toEqual(['https://example.com/', 'https://example.com/about']);
  });

  it('recognises a sitemap index instead of reporting zero URLs', () => {
    const xml = `<?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://ahrefs.com/academy/sitemap.xml</loc></sitemap>
        <sitemap><loc>https://ahrefs.com/benchmarks/sitemap.xml</loc></sitemap>
      </sitemapindex>`;
    const parsed = parseSitemapXml(xml);
    expect(parsed.kind).toBe('sitemapindex');
    expect(parsed.children).toHaveLength(2);
    expect(parsed.urls).toHaveLength(0);
  });

  it('rejects HTML that is served with a 200 status', () => {
    const parsed = parseSitemapXml('<!doctype html><html><body>not a sitemap</body></html>');
    expect(parsed.kind).toBe('unknown');
  });
});
