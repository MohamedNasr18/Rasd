'use client';

import { labelFor, sortChecks } from '@/lib/checks';
import type { CheckResult, CheckStatus } from '@/types';
import { useI18n } from '@/i18n/I18nProvider';
import StatusBadge from './StatusBadge';

const STATUS_ICONS: Record<CheckStatus, string> = {
  fail: 'cancel',
  warning: 'warning',
  unknown: 'help',
  pass: 'check_circle',
};

const STATUS_CIRCLES: Record<CheckStatus, string> = {
  fail: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  unknown: 'bg-gray-100 text-gray-500',
  pass: 'bg-green-50 text-green-600',
};

function asDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const data = details as Record<string, unknown>;
  return Object.keys(data).length > 0 ? data : null;
}

function SiteCheckDetails({ result }: { result: CheckResult }) {
  const { dict } = useI18n();
  const labels = dict.checks.details;
  const data = asDetails(result.details);
  if (!data) return null;

  const url = typeof data.url === 'string' && data.url ? data.url : null;
  const isIndex = data.root === 'sitemapindex';
  const count = (key: string) => (typeof data[key] === 'number' ? (data[key] as number) : null);
  const text = (key: string) => (typeof data[key] === 'string' && data[key] ? (data[key] as string) : null);
  const problems = Array.isArray(data.problems)
    ? (data.problems as unknown[]).map(String).filter((value) => value.length > 0)
    : [];
  const error = text('error');

  const pairs: Array<[string, string]> = [];
  const add = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    pairs.push([key, String(value)]);
  };

  add('statusCode', count('statusCode'));
  add('root', text('root'));
  add('source', text('source'));
  add('urlCount', count('urlCount'));

  const declared = count('declaredChildSitemaps');
  const read = count('childSitemaps');
  if (isIndex || (declared ?? 0) > 0) add('declaredChildSitemaps', declared);
  if (isIndex || (read ?? 0) > 0) add('childSitemaps', read);

  const failed = count('failedChildren');
  if ((failed ?? 0) > 0) add('failedChildren', failed);

  const declaredInRobots = count('declaredInRobots');
  if ((declaredInRobots ?? 0) > 0) add('declaredInRobots', declaredInRobots);

  if (data.blocksEverything === true) pairs.push(['blocksEverything', dict.pageDetail.yes]);

  const handled = new Set([
    'url', 'statusCode', 'root', 'source', 'urlCount', 'declaredChildSitemaps', 'childSitemaps',
    'failedChildren', 'declaredInRobots', 'blocksEverything', 'problems', 'error',
  ]);
  for (const [key, value] of Object.entries(data)) {
    if (handled.has(key) || Array.isArray(value)) continue;
    if (value === null || value === undefined || value === '' || typeof value === 'object') continue;
    pairs.push([key, String(value)]);
  }

  if (!url && pairs.length === 0 && problems.length === 0 && !error) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
      {url && (
        <div className="mb-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-gray-500">{labels.url}</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title={url}
            className="flex min-w-0 items-center gap-1.5 text-blue-600 hover:underline"
          >
            <span dir="ltr" className="truncate font-mono text-xs">
              {url}
            </span>
            <span className="material-symbols-outlined shrink-0 text-[14px]">open_in_new</span>
          </a>
        </div>
      )}

      {pairs.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {pairs.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold text-gray-500">{labels[key] ?? key}</dt>
              <dd
                dir={key === 'root' || key === 'source' ? 'ltr' : undefined}
                className={`w-fit font-mono text-xs font-semibold ${
                  key === 'blocksEverything' ? 'text-red-600' : 'text-gray-800'
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {error && (
        <p className="mt-3 font-mono text-xs text-red-600" dir="ltr">
          {error}
        </p>
      )}

      {problems.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500">{labels.problems}</span>
          <div className="flex flex-wrap gap-1.5">
            {problems.map((problem, index) => (
              <span
                key={`${problem}-${index}`}
                dir="ltr"
                className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-700"
              >
                {problem}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckList({ results }: { results: CheckResult[] }) {
  const { dict } = useI18n();
  const copy = dict.scan;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-lg font-bold tracking-tight text-gray-900">{copy.siteChecks}</h3>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            {copy.siteChecksCount(results.length)}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          <span dir="ltr" className="inline-block font-mono">
            {copy.siteChecksRowHint}
          </span>
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {sortChecks(results).map((result) => (
          <li key={result.check} className="space-y-3 p-5 md:p-6">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${STATUS_CIRCLES[result.status]}`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {STATUS_ICONS[result.status]}
                </span>
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-gray-900">{labelFor(dict, result.check)}</h4>
                  <StatusBadge status={result.status} />
                </div>
                <p dir="auto" className="text-sm leading-relaxed text-gray-600">
                  {result.message}
                </p>
              </div>
            </div>

            <SiteCheckDetails result={result} />
          </li>
        ))}
      </ul>
    </section>
  );
}
