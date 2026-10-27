'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useGetSiteScanQuery, useGetScoreHistoryQuery } from '@/store/api';
import { countStatuses, scoreColor } from '@/lib/checks';
import CheckList from '@/components/CheckList';
import PagesTable from '@/components/PagesTable';
import StatusChart from '@/components/StatusChart';
import ScoreTrendChart from '@/components/ScoreTrendChart';
import ReportSection from '@/components/ReportSection';
import ChatPanel from '@/components/ChatPanel';
import type { Scan } from '@/types';

// Same normalisation as the backend: protocol / www / trailing slash shouldn't
// split one page into two "latest result" entries.
function normaliseUrl(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const [pollingInterval, setPollingInterval] = useState(2000);
  const { data, isLoading, error } = useGetSiteScanQuery(id, { pollingInterval });
  const { data: history } = useGetScoreHistoryQuery(id, {
    skip: data?.status !== 'completed',
  });

  useEffect(() => {
    if (data && data.status !== 'processing') setPollingInterval(0);
  }, [data]);

  const scans = useMemo(() => data?.scans ?? [], [data]);

  // One row per URL: the newest scan wins (agent re-scans included).
  const latestScans = useMemo(() => {
    const byUrl = new Map<string, Scan>();
    for (const scan of scans) byUrl.set(normaliseUrl(scan.url), scan);
    return [...byUrl.values()];
  }, [scans]);

  const rescans = useMemo(
    () => scans.filter((s) => s.triggeredBy === 'agent_rescan'),
    [scans],
  );

  const previousById = useMemo(() => {
    const map = new Map<string, Scan>();
    for (const scan of scans) map.set(scan.id, scan);
    return map;
  }, [scans]);

  const currentAverage = useMemo(() => {
    if (latestScans.length === 0) return null;
    const total = latestScans.reduce((sum, s) => sum + s.score, 0);
    return Math.round(total / latestScans.length);
  }, [latestScans]);

  const counts = useMemo(
    () => countStatuses(latestScans.flatMap((s) => s.results ?? [])),
    [latestScans],
  );

  const hasRescans = rescans.length > 0;
  const lastRescanAt = hasRescans
    ? rescans.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
    : null;

  if (isLoading) return <main className="p-12 text-center">جاري التحميل...</main>;
  if (error || !data)
    return <main className="p-12 text-center text-red-600">مش لاقي التحليل ده.</main>;

  const percent =
    data.pageCount > 0 ? Math.round((data.completedPages / data.pageCount) * 100) : 0;

  const headline = hasRescans ? currentAverage : data.averageScore;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/" className="text-sm text-blue-600">← الرئيسية</Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">نتيجة التحليل</h1>

      {data.status === 'processing' && (
        <div className="rounded-lg border bg-white p-6">
          <p className="mb-3">
            جاري تحليل الصفحات... {data.completedPages} من {data.pageCount}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {data.status === 'failed' && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">التحليل فشل، جرب تاني.</p>
      )}

      {data.status === 'completed' && (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-white p-6">
              <p className="text-sm text-gray-500">
                {hasRescans ? 'درجة الحالة الحالية' : 'النتيجة الإجمالية'}
              </p>
              <p className={`text-6xl font-bold ${scoreColor(headline ?? 0)}`}>
                {headline ?? '—'}
                <span className="text-xl text-gray-400">/100</span>
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {latestScans.length} صفحة تم تحليلها
              </p>
              {hasRescans && (
                <div className="mt-3 space-y-1 border-t pt-2 text-xs text-gray-500">
                  <p>
                    درجة الفحص الأصلي:{' '}
                    <span className="font-medium text-gray-700">{data.averageScore}/100</span>
                    {' · '}
                    {formatDate(data.createdAt)}
                  </p>
                  {lastRescanAt && <p>آخر إعادة فحص: {formatDate(lastRescanAt)}</p>}
                </div>
              )}
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="mb-1 text-sm text-gray-500">
                {hasRescans ? 'توزيع الحالة الحالية' : 'توزيع نتايج الفحوصات'}
              </p>
              <StatusChart counts={counts} />
            </div>
          </div>

          {hasRescans && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              بعض الصفحات أُعيد فحصها بعد الفحص الأصلي. الأرقام والتوزيع فوق بيعرضوا أحدث
              نتيجة لكل صفحة، فممكن تكون من أوقات مختلفة.
            </p>
          )}

          <section className="rounded-lg border bg-white p-6">
            <h2 className="mb-1 text-lg font-semibold">تطور الدرجة</h2>
            <p dir="ltr" className="mb-4 truncate text-sm text-gray-500">
              {history?.url ?? ''}
            </p>
            {history ? (
              <ScoreTrendChart points={history.points} />
            ) : (
              <p className="py-6 text-center text-sm text-gray-500">جاري التحميل...</p>
            )}
          </section>

          {data.siteLevelResults && data.siteLevelResults.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">فحوصات على مستوى الموقع</h2>
              <CheckList results={data.siteLevelResults} />
            </section>
          )}

          <ReportSection siteScanId={data.id} rescanAt={lastRescanAt} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">الصفحات</h2>
            <p className="mb-3 text-xs text-gray-500">
              بنعرض أحدث نتيجة لكل صفحة. علامة «أُعيد الفحص» معناها إن فيه نسخة أحدث من
              الفحص الأصلي، والفرق بيتعرض بس لو النسختين اتعملوا بنفس نسخة المحلل.
            </p>
            <PagesTable
              scans={latestScans}
              siteScanId={data.id}
              previousById={previousById}
            />
          </section>

          <ChatPanel siteScanId={data.id} />
        </div>
      )}
    </main>
  );
}
