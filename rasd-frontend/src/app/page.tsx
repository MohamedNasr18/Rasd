'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useListSiteScansQuery, useStartScanMutation } from '@/store/api';

export default function HomePage() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [startScan, { isLoading, error }] = useStartScanMutation();
  const { data: scans, isLoading: listLoading } = useListSiteScansQuery();

  async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setErrorMsg(null);
  try {
    const res = await startScan({ url: url.trim() }).unwrap();
    router.push(`/scans/${res.siteScanId}`);
  } catch (err: any) {
  console.error('startScan failed:', err);

  if (err?.status === 'FETCH_ERROR') {
    setErrorMsg('مش قادر أوصل للسيرفر. اتأكد إنه شغال.');
  } else if (err?.status === 400) {
    setErrorMsg(
      err?.data?.message ?? 'الرابط غير مقبول أو البيانات غير صحيحة.'
    );
  } else if (err?.status === 'PARSING_ERROR') {
    setErrorMsg('السيرفر رجّع استجابة غير متوقعة.');
  } else {
    setErrorMsg(
      err?.data?.message ??
      `خطأ من السيرفر (${err?.status ?? 'unknown'})`
    );
  }
}
}

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">رصد</h1>
      <p className="mb-8 text-gray-600">
        حلل السيو بتاع موقعك واحصل على تقرير وخطوات تنفيذ بالعربي.
      </p>

      <form onSubmit={onSubmit} className="mb-3 flex gap-2">
        <input
          type="url"
          required
          dir="ltr"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
        />
        <button
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white disabled:opacity-50"
        >
          {isLoading ? 'جاري اكتشاف الصفحات...' : 'ابدأ التحليل'}
        </button>
      </form>
      {errorMsg && (
  <p className="mb-6 text-sm text-red-600">
    {errorMsg}
  </p>
)}

      <h2 className="mb-3 mt-10 text-xl font-semibold">آخر التحليلات</h2>
      {listLoading && <p className="text-gray-500">جاري التحميل...</p>}
      {scans?.length === 0 && <p className="text-gray-500">لسه مفيش تحليلات.</p>}
      <ul className="space-y-2">
        {scans?.map((s) => (
          <li key={s.id}>
            <Link
              href={`/scans/${s.id}`}
              className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 hover:border-blue-400"
            >
              <span dir="ltr" className="truncate">{s.site.url}</span>
              <span className="text-sm text-gray-600">
                {s.status === 'completed'
                  ? `النتيجة: ${s.averageScore ?? '-'}/100`
                  : s.status === 'failed'
                    ? 'فشل'
                    : `${s.completedPages}/${s.pageCount}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}