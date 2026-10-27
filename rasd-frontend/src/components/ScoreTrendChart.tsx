'use client';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ScorePoint } from '@/types';

const shortDate = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
const clockTime = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });

const dayKey = (iso: string) => new Date(iso).toDateString();

export default function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        محتاج فحصين على الأقل عشان يظهر التطور.
      </p>
    );
  }

  const data = points.map((p, i) => {
    const date = new Date(p.createdAt);
    const previous = points[i - 1];
    // Several scans can happen on the same day. Show the day once and the time
    // for the rest, otherwise the x-axis repeats identical day labels.
    const isNewDay = !previous || dayKey(previous.createdAt) !== dayKey(p.createdAt);
    const label = isNewDay ? shortDate.format(date) : clockTime.format(date);
    return { ...p, label };
  });

  return (
    <div>
      <div className="h-60 w-full" dir="ltr">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={40} />
            <Tooltip
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as
                  | (ScorePoint & { label: string })
                  | undefined;
                if (!active || !point) return null;

                return (
                  <div
                    dir="rtl"
                    className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm"
                  >
                    <p className="mb-1 font-medium">
                      {longDate.format(new Date(point.createdAt))} —{' '}
                      {clockTime.format(new Date(point.createdAt))}
                    </p>
                    <p>
                      الدرجة: <span className="font-bold">{point.averageScore}</span>/100
                    </p>
                    <p className="text-gray-500">{point.pageCount} صفحة تم فحصها</p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="averageScore"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        المقارنة تقريبية لو عدد الصفحات اختلف بين الفحوصات.
      </p>
    </div>
  );
}
