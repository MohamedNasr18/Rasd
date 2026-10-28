import { describe, it, expect } from 'vitest';
import { buildEvidence, translateEvidenceMessage } from './evidence.js';

const base = {
  failCount: 0,
  warningCount: 3,
  unknownCount: 0,
  passCount: 0,
  unmeasured: {},
};

describe('buildEvidence', () => {
  it('collapses the same warning repeated on every page into one line', () => {
    const evidence = buildEvidence({
      ...base,
      messageCounts: { 'No canonical tag found.': 3 },
    });

    expect(evidence).toBe('3 تحذيرات على 3 صفحات — لا يوجد وسم canonical');
    expect(evidence.match(/canonical/g)).toHaveLength(1);
  });

  it('merges per-page title lengths instead of repeating the template', () => {
    const evidence = buildEvidence({
      ...base,
      messageCounts: {
        'Title length is 19 chars. Ideal range is 30-60.': 2,
        'Title length is 12 chars. Ideal range is 30-60.': 1,
      },
    });

    expect(evidence).toBe(
      '3 تحذيرات على 3 صفحات — طول العنوان: 19 حرفًا على صفحتين، 12 حرفًا على صفحة واحدة (المطلوب 30–60)',
    );
    expect(evidence.match(/Title length/g)).toBeNull();
  });

  it('uses correct Arabic for fails and warnings together', () => {
    const evidence = buildEvidence({
      ...base,
      failCount: 1,
      warningCount: 2,
      messageCounts: { 'Missing security headers: x-content-type-options.': 3 },
    });

    expect(evidence).toContain('فشل واحد وتحذيران على 3 صفحات');
    expect(evidence).toContain('ترويسات أمان ناقصة: x-content-type-options');
  });

  it('says the affected pages out of the total when they differ', () => {
    const evidence = buildEvidence({
      failCount: 0,
      warningCount: 2,
      unknownCount: 0,
      passCount: 1,
      unmeasured: {},
      messageCounts: { 'No canonical tag found.': 2 },
    });

    expect(evidence).toBe('تحذيران على صفحتين من 3 صفحات — لا يوجد وسم canonical');
  });

  it('keeps the unmeasured note', () => {
    const evidence = buildEvidence({
      failCount: 3,
      warningCount: 0,
      unknownCount: 0,
      passCount: 0,
      messageCounts: { 'Core Web Vitals need improvement (lab only, no field data yet): LCP 4.2s (lab, poor).': 3 },
      unmeasured: { inp: 1 },
    });

    expect(evidence).toContain('لم يُقس: INP (صفحة واحدة)');
    expect(evidence).toContain('تحتاج تحسين');
  });

  it('caps unknown messages and says there are more', () => {
    const evidence = buildEvidence({
      ...base,
      messageCounts: {
        'Unknown message one.': 3,
        'Unknown message two.': 3,
        'Unknown message three.': 3,
      },
    });

    expect(evidence).toContain('وغيرها');
    expect(evidence).not.toContain('Unknown message three');
  });
});

describe('translateEvidenceMessage', () => {
  it('translates CWV metric ratings', () => {
    const text = translateEvidenceMessage(
      'Core Web Vitals are poor (Chrome UX url-level field data): LCP 4.2s (field, poor).',
    );

    expect(text).toContain('ضعيفة');
    expect(text).toContain('بيانات ميدانية على مستوى الصفحة');
    expect(text).toContain('(ميداني، ضعيف)');
  });

  it('falls back to the original text for unknown templates', () => {
    expect(translateEvidenceMessage('Something new happened.')).toBe('Something new happened.');
  });
});
