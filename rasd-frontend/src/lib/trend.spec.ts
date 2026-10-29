import { describe, expect, it } from 'vitest';
import { trendView } from './trend';
import { dictionaries } from '@/i18n/dictionaries';

describe('trendView', () => {
  it('waits for the history and auth checks before deciding', () => {
    expect(trendView({ loading: true, signedIn: false, pointCount: 0 })).toBe('loading');
    expect(trendView({ loading: true, signedIn: true, pointCount: 5 })).toBe('loading');
  });

  it('shows the guidance message before sign-in regardless of the point count', () => {
    expect(trendView({ loading: false, signedIn: false, pointCount: 0 })).toBe('guest-empty');
    expect(trendView({ loading: false, signedIn: false, pointCount: 3 })).toBe('guest-empty');
  });

  it('shows the chart only with at least two eligible completed scans', () => {
    expect(trendView({ loading: false, signedIn: true, pointCount: 1 })).toBe('user-empty');
    expect(trendView({ loading: false, signedIn: true, pointCount: 2 })).toBe('chart');
    expect(trendView({ loading: false, signedIn: true, pointCount: 0 })).toBe('user-empty');
  });
});

describe('trend copy', () => {
  it('keeps the required Arabic guidance text', () => {
    expect(dictionaries.ar.trend.emptyGuest).toBe(
      'يظهر الرسم البياني عند وجود أكثر من فحص، حتى تتمكن من متابعة التغييرات في نتائج موقعك. سجّل الدخول، وعدّل موقعك، ثم أجرِ فحصًا جديدًا لمشاهدة الرسم البياني.',
    );
  });

  it('has a non-empty English equivalent', () => {
    expect(dictionaries.en.trend.emptyGuest.length).toBeGreaterThan(20);
    expect(dictionaries.en.trend.emptyCta.length).toBeGreaterThan(0);
  });
});
