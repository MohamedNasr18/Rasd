
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { countStatuses, scoreColor } from '@/lib/checks';
import { setPagesSearch } from '@/store/slices/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { Scan } from '@/types';
import { useI18n } from '@/i18n/I18nProvider';
import { localePath } from '@/i18n/config';
import { formatDateShort } from '@/i18n/format';

const col = createColumnHelper<Scan>();

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
  const dispatch = useAppDispatch();
  const search = useAppSelector((s) => s.ui.pagesSearch);

  const data = useMemo(
    () => scans.filter((s) => s.url.toLowerCase().includes(search.toLowerCase())),
    [scans, search],
  );

  const columns = useMemo(
    () => [
      col.accessor('url', {
        header: dict.pagesTable.page,
        cell: (c) => {
          const scan = c.row.original;

          return (
            <div className="flex items-center gap-2">
              <Link
                href={localePath(locale, `/scans/${siteScanId}/pages/${scan.id}`)}
                dir="ltr"
                className="block max-w-md truncate text-blue-600 hover:underline"
              >
                {c.getValue()}
              </Link>

              {scan.triggeredBy === 'agent_rescan' && (
                <span
                  title={dict.pagesTable.rescannedTitle}
                  className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                >
                  {dict.pagesTable.rescanned}
                </span>
              )}
            </div>
          );
        },
      }),

      col.accessor('score', {
        header: dict.pagesTable.score,
        cell: (c) => {
          const scan = c.row.original;
          const previous = scan.previousScanId
            ? previousById.get(scan.previousScanId)
            : undefined;

          const sameVersion =
            !!previous &&
            !!scan.analyzerVersion &&
            scan.analyzerVersion === previous.analyzerVersion;

          const delta =
            previous && sameVersion ? scan.score - previous.score : null;

          return (
            <div className="flex items-center gap-2">
              <span className={`font-bold ${scoreColor(c.getValue())}`}>
                {c.getValue()}
              </span>

              {delta !== null && delta !== 0 && (
                <span
                  className={`text-xs font-medium ${
                    delta > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                  title={dict.pagesTable.compareTitle(previous?.score ?? 0)}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
              )}
            </div>
          );
        },
      }),

      col.accessor((r) => countStatuses(r.results).fail, {
        id: 'fails',
        header: dict.pagesTable.fails,
      }),

      col.accessor((r) => countStatuses(r.results).warning, {
        id: 'warnings',
        header: dict.pagesTable.warnings,
      }),

      col.accessor('createdAt', {
        header: dict.pagesTable.lastScan,
        cell: (c) => {
          const scan = c.row.original;

          return (
            <div className="whitespace-nowrap text-xs text-gray-500">
              <span title={new Date(scan.createdAt).toISOString()}>
                {formatDateShort(locale, scan.createdAt)}
              </span>

              {scan.previousScanId && (
                <Link
                  href={localePath(
                    locale,
                    `/scans/${siteScanId}/pages/${scan.previousScanId}`,
                  )}
                  title={dict.pagesTable.previousTitle}
                  className="ms-2 text-blue-600 hover:underline"
                >
                  {dict.pagesTable.before}
                </Link>
              )}
            </div>
          );
        },
      }),
    ],
    [locale, dict, siteScanId, previousById],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <input
        value={search}
        onChange={(e) => dispatch(setPagesSearch(e.target.value))}
        placeholder={dict.pagesTable.searchPlaceholder}
        className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-start">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-2 text-start font-medium"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}

            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500"
                >
                  {dict.pagesTable.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
