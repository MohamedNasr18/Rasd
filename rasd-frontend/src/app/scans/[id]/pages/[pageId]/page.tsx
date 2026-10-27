'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useGetSiteScanQuery } from '@/store/api';
import { countStatuses, scoreColor } from '@/lib/checks';
import CheckList from '@/components/CheckList';

export default function PageDetails() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { data, isLoading } = useGetSiteScanQuery(id);

  if (isLoading) return <main className="p-12 text-center">جاري التحميل...</main>;

  const scan = data?.scans.find((s) => s.id === pageId);
  if (!scan) return <main className="p-12 text-center text-red-600">الصفحة مش موجودة.</main>;

  const counts = countStatuses(scan.results);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href={`/scans/${id}`} className="text-sm text-blue-600">← رجوع للنتيجة</Link>
      <h1 dir="ltr" className="mb-2 mt-2 break-all text-left text-xl font-bold">{scan.url}</h1>
      <p className="mb-6 text-gray-600">
        النتيجة: <span className={`font-bold ${scoreColor(scan.score)}`}>{scan.score}/100</span>
        {' · '}{counts.fail} فاشلة · {counts.warning} تحذيرات · {counts.pass} ناجحة
      </p>
      <CheckList results={scan.results} />
    </main>
  );
}