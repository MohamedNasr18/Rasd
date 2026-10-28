'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search, SearchX } from 'lucide-react';
import { countStatuses, scoreBarColor, scoreColor } from '@/lib/checks';
import { setPagesFilter, setPagesSearch } from '@/store/slices/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { Scan } from '@/types';
import { useI18n } from '@/i18n/I18nProvider';
import { localePath } from '@/i18n/config';
import { formatDateShort } from '@/i18n/format';

const col = createColumnHelper<Scan>();

function CountPill({ kind, value }: { kind: 'fail' | 'warn'; value: number }) {
  if (value <= 0) return <span className="font-mono text-xs text-gray-400">0</span>;
  const tone =
    kind === 'fail'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

export default function PagesTable({
  scans,
  siteScanId,
  previousById,
}: {
  scans: Scan[];
  siteScanId: string;
  previousById: Map<string, Scan>;
}) {
  const { locale, dict } = useI18n();
  const copy = dict.pagesTable;
  const dispatch = useAppDispatch();
  const search = useAppSelector((s) => s.ui.pagesSearch);
  const filter = useAppSelector((s) => s.ui.pagesFilter);

const data = useMemo(() => {
  const term = search.toLowerCase();

  return scans
    .filter((s) => {
      if (!s.url.toLowerCase().includes(term)) return false;
      if (filter === 'issues') {
        const counts = countStatuses(s.results);
        return counts.fail + counts.warning > 0;
      }
      if (filter === 'rescanned') return s.triggeredBy === 'agent_rescan';
      return true;
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return (
        countStatuses(b.results).fail - countStatuses(a.results).fail
      );
    });
}, [scans, search, filter]);

  const getDelta = useCallback(
    (scan: Scan): number | null => {
      const previous = scan.previousScanId ? previousById.get(scan.previousScanId) : undefined;
      if (!previous) return null;
      if (!scan.analyzerVersion || scan.analyzerVersion !== previous.analyzerVersion) return null;
      const delta = scan.score - previous.score;
      return delta === 0 ? null : delta;
    },
    [previousById],
  );

  const columns = useMemo(
    () => [
      col.accessor('url', {
        header: copy.page,
        cell: (c) => {
          const scan = c.row.original;

          return (
            <div className="flex items-center gap-2">
              {scan.triggeredBy === 'agent_rescan' && (
                <span
                  title={copy.rescannedTitle}
                  className="inline-flex whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700"
                >
                  {copy.rescanned}
                </span>
              )}

              <Link
                href={localePath(locale, `/scans/${siteScanId}/pages/${scan.id}`)}
                dir="ltr"
                title={scan.url}
                className="block max-w-md truncate text-start font-mono text-[13px] text-gray-700 group-hover:text-blue-600 group-hover:underline focus:outline-none"
              >
                {scan.url}
              </Link>
            </div>
          );
        },
      }),

      col.accessor('score', {
        header: copy.score,
        cell: (c) => {
          const scan = c.row.original;
          const previous = scan.previousScanId ? previousById.get(scan.previousScanId) : undefined;
          const delta = getDelta(scan);

          return (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-base font-bold ${scoreColor(scan.score)}`}>
                  {scan.score}
                </span>

                {delta !== null && (
                  <span
                    title={copy.compareTitle(previous?.score ?? 0)}
                    className={`cursor-help rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                      delta > 0
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>
                )}
              </div>

              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${scoreBarColor(scan.score)}`}
                  style={{ width: `${Math.max(0, Math.min(100, scan.score))}%` }}
                />
              </div>
            </div>
          );
        },
      }),

      col.accessor((r) => countStatuses(r.results).fail, {
        id: 'fails',
        header: copy.fails,
        cell: (c) => <CountPill kind="fail" value={c.getValue()} />,
      }),

      col.accessor((r) => countStatuses(r.results).warning, {
        id: 'warnings',
        header: copy.warnings,
        cell: (c) => <CountPill kind="warn" value={c.getValue()} />,
      }),

      col.accessor('createdAt', {
        header: copy.lastScan,
        cell: (c) => {
          const scan = c.row.original;

          return (
            <div className="whitespace-nowrap text-xs text-gray-600">
              <span title={new Date(scan.createdAt).toISOString()}>
                {formatDateShort(locale, scan.createdAt)}
              </span>

              {scan.previousScanId && (
                <Link
                  href={localePath(locale, `/scans/${siteScanId}/pages/${scan.previousScanId}`)}
                  title={copy.previousTitle}
                  className="ms-2 text-[11px] font-semibold text-blue-600 underline hover:text-blue-800"
                >
                  {copy.before}
                </Link>
              )}
            </div>
          );
        },
      }),
    ],
    [locale, copy, siteScanId, previousById, getDelta],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <SearchX size={20} />
      </div>
      <p className="text-sm font-semibold text-gray-600">{copy.empty}</p>
      <p className="text-xs text-gray-400">{copy.emptyHint}</p>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-gray-100 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-bold tracking-tight text-gray-900">{copy.title}</h3>
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
              {copy.count(data.length)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['all', copy.filterAll],
                ['issues', copy.filterIssues],
                ['rescanned', copy.filterRescanned],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => dispatch(setPagesFilter(value))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === value
                    ? 'border-blue-200/60 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => dispatch(setPagesSearch(e.target.value))}
            placeholder={copy.searchPlaceholder}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-10 pe-3.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead className="border-b border-gray-200/80 bg-gray-50/75 text-[13px] font-semibold text-gray-600">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h, i) => (
                  <th
                    key={h.id}
                    className={`py-3 text-start ${i === 0 || i === hg.headers.length - 1 ? 'px-5' : 'px-4'}`}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group transition-colors duration-150 hover:bg-blue-50/40 focus-within:bg-blue-50/60 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500"
              >
                {row.getVisibleCells().map((cell, i) => (
                  <td
                    key={cell.id}
                    className={`py-4 ${i === 0 || i === row.getVisibleCells().length - 1 ? 'px-5' : 'px-4'}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>{emptyState}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-gray-100 md:hidden">
        {rows.map((row) => {
          const scan = row.original;
          const delta = getDelta(scan);
          const previous = scan.previousScanId ? previousById.get(scan.previousScanId) : undefined;
          const counts = countStatuses(scan.results);

          return (
            <div key={row.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {scan.triggeredBy === 'agent_rescan' && (
                    <span
                      title={copy.rescannedTitle}
                      className="mb-1 inline-flex whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700"
                    >
                      {copy.rescanned}
                    </span>
                  )}
                  <Link
                    href={localePath(locale, `/scans/${siteScanId}/pages/${scan.id}`)}
                    dir="ltr"
                    title={scan.url}
                    className="block truncate text-start font-mono text-xs text-gray-700"
                  >
                    {scan.url}
                  </Link>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-mono text-base font-bold ${scoreColor(scan.score)}`}>
                      {scan.score}
                    </span>
                    {delta !== null && (
                      <span
                        title={copy.compareTitle(previous?.score ?? 0)}
                        className={`cursor-help rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                          delta > 0
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${scoreBarColor(scan.score)}`}
                      style={{ width: `${Math.max(0, Math.min(100, scan.score))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs">
                <div className="flex items-center gap-3 text-gray-500">
                  <span className="flex items-center gap-1.5">
                    {copy.fails}:
                    <CountPill kind="fail" value={counts.fail} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    {copy.warnings}:
                    <CountPill kind="warn" value={counts.warning} />
                  </span>
                </div>

                <div className="flex items-center gap-2 text-gray-600">
                  <span title={new Date(scan.createdAt).toISOString()}>
                    {formatDateShort(locale, scan.createdAt)}
                  </span>
                  {scan.previousScanId && (
                    <Link
                      href={localePath(locale, `/scans/${siteScanId}/pages/${scan.previousScanId}`)}
                      title={copy.previousTitle}
                      className="text-[11px] font-semibold text-blue-600 underline hover:text-blue-800"
                    >
                      {copy.before}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && emptyState}
      </div>
    </section>
  );
}
