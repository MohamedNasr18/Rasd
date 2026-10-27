'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel,
  useReactTable, type SortingState,
} from '@tanstack/react-table';
import { countStatuses, scoreColor } from '@/lib/checks';
import { setPagesSearch } from '@/store/slices/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { Scan } from '@/types';

const col = createColumnHelper<Scan>();

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
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
  const dispatch = useAppDispatch();
  const search = useAppSelector((s) => s.ui.pagesSearch);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'score', desc: false }]);

  const data = useMemo(
    () => scans.filter((s) => s.url.toLowerCase().includes(search.toLowerCase())),
    [scans, search],
  );

  const columns = useMemo(
    () => [
      col.accessor('url', {
        header: 'الصفحة',
        cell: (c) => {
          const scan = c.row.original;
          return (
            <div className="flex items-center gap-2">
              <Link
                href={`/scans/${siteScanId}/pages/${scan.id}`}
                dir="ltr"
                className="block max-w-md truncate text-blue-600 hover:underline"
              >
                {c.getValue()}
              </Link>
              {scan.triggeredBy === 'agent_rescan' && (
                <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  أُعيد الفحص
                </span>
              )}
            </div>
          );
        },
      }),
      col.accessor('score', {
        header: 'النتيجة',
        cell: (c) => {
          const scan = c.row.original;
          const previous = scan.previousScanId
            ? previousById.get(scan.previousScanId)
            : undefined;
          // A delta across two analyzer versions mixes different rules, so it is
          // only shown when both sides were produced by the same version.
          const sameVersion =
            !!previous &&
            !!scan.analyzerVersion &&
            scan.analyzerVersion === previous.analyzerVersion;
          const delta = previous && sameVersion ? scan.score - previous.score : null;

          return (
            <div className="flex items-center gap-2">
              <span className={`font-bold ${scoreColor(c.getValue())}`}>{c.getValue()}</span>
              {delta !== null && delta !== 0 && (
                <span
                  className={`text-xs font-medium ${
                    delta > 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                  title={`مقارنة بالفحص السابق (${previous?.score}/100)`}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </span>
              )}
              {previous && !sameVersion && (
                <span
                  className="text-[10px] text-gray-400"
                  title="الفحصين اتعملوا بنسختين مختلفتين من المحلل، فالفرق مش قابل للمقارنة"
                >
                  نسخة مختلفة
                </span>
              )}
            </div>
          );
        },
      }),
      col.accessor((r) => countStatuses(r.results).fail, {
        id: 'fails',
        header: 'فاشلة',
      }),
      col.accessor((r) => countStatuses(r.results).warning, {
        id: 'warnings',
        header: 'تحذيرات',
      }),
      col.accessor('createdAt', {
        header: 'آخر فحص',
        cell: (c) => {
          const scan = c.row.original;
          return (
            <div className="whitespace-nowrap text-xs text-gray-500">
              <span title={new Date(scan.createdAt).toISOString()}>
                {formatDate(scan.createdAt)}
              </span>
              {scan.previousScanId && (
                <Link
                  href={`/scans/${siteScanId}/pages/${scan.previousScanId}`}
                  className="ms-2 text-blue-600 hover:underline"
                >
                  قبل
                </Link>
              )}
            </div>
          );
        },
      }),
    ],
    [siteScanId, previousById],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div>
      <input
        value={search}
        onChange={(e) => dispatch(setPagesSearch(e.target.value))}
        placeholder="ابحث في الصفحات..."
        className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-right">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none px-4 py-2 font-medium"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
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
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  مفيش نتايج.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
