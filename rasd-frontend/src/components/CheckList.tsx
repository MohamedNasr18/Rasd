import { labelFor, sortChecks } from '@/lib/checks';
import type { CheckResult } from '@/types';
import StatusBadge from './StatusBadge';

const DETAIL_LABELS: Array<[string, string]> = [
  ['provenance', 'مصدر القياس'],
  ['strategy', 'الجهاز'],
  ['url', 'الخريطة'],
  ['root', 'نوع الخريطة'],
  ['source', 'طريقة الاكتشاف'],
  ['declaredChildSitemaps', 'خرائط معلنة'],
  ['childSitemaps', 'خرائط مقروءة'],
  ['urlCount', 'عدد الروابط'],
  ['error', 'السبب'],
];

type Metric = { key?: string; value?: number; unit?: string; source?: string; rating?: string };

function formatMetric(metric: Metric): string {
  const key = (metric.key ?? '').toUpperCase();
  const value = metric.value ?? 0;
  const shown =
    metric.unit === 's' || metric.key === 'lcp'
      ? `${(value / 1000).toFixed(1)}s`
      : metric.key === 'cls'
        ? value.toFixed(2)
        : `${Math.round(value)}ms`;
  return [key, shown, metric.source, metric.rating].filter(Boolean).join(' · ');
}

// تفاصيل الفحص ("details") كانت بتتعرض كـ JSON خام في الواجهة؛ هنا بنعرضها
// كسطور مقروءة، ونعتمد على نص الرسالة لو التفاصيل مش من النوع المعروف.
function renderDetails(details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;

  const data = details as Record<string, unknown>;
  const rows: Array<[string, string]> = [];

  if (Array.isArray(data.metrics) && data.metrics.length > 0) {
    rows.push(['القياسات', (data.metrics as Metric[]).map(formatMetric).join('  •  ')]);
  }
  if (Array.isArray(data.missing) && data.missing.length > 0) {
    rows.push(['لم يُقس', (data.missing as string[]).map((key) => key.toUpperCase()).join(', ')]);
  }

  for (const [key, label] of DETAIL_LABELS) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push([label, String(value)]);
  }

  if (rows.length === 0) return null;

  return (
    <dl className="mt-2 space-y-1 rounded bg-gray-50 p-2 text-xs text-gray-600">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap gap-x-2">
          <dt className="font-medium">{label}:</dt>
          <dd dir="auto" className="break-all">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function CheckList({ results }: { results: CheckResult[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-white">
      {sortChecks(results).map((r) => (
        <li key={r.check} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{labelFor(r.check)}</span>
            <StatusBadge status={r.status} />
          </div>
          <p className="mt-1 text-sm text-gray-600">{r.message}</p>
          {renderDetails(r.details)}
        </li>
      ))}
    </ul>
  );
}
