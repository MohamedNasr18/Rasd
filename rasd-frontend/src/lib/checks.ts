import type { CheckResult, CheckStatus } from '@/types';
import type { Dictionary } from '@/i18n/dictionaries';

// أي check مش في القاموس هيظهر باسمه التقني
export const labelFor = (dict: Dictionary, check: string) =>
  dict.checks.labels[check] ?? check;

export const STATUS_META: Record<
  CheckStatus,
  { badge: string; color: string; order: number }
> = {
  fail: { badge: 'bg-red-100 text-red-700', color: '#dc2626', order: 0 },
  warning: { badge: 'bg-amber-100 text-amber-700', color: '#f59e0b', order: 1 },
  unknown: { badge: 'bg-gray-100 text-gray-600', color: '#9ca3af', order: 2 },
  pass: { badge: 'bg-green-100 text-green-700', color: '#16a34a', order: 3 },
};

export function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export function countStatuses(results: CheckResult[]) {
  const counts: Record<CheckStatus, number> = { pass: 0, warning: 0, fail: 0, unknown: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

// المشاكل الأول، وبعدها الأعلى وزناً
export function sortChecks(results: CheckResult[]) {
  return [...results].sort(
    (a, b) =>
      STATUS_META[a.status].order - STATUS_META[b.status].order ||
      (b.weight ?? 0) - (a.weight ?? 0),
  );
}
