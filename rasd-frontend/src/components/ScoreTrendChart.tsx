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
import { useI18n } from '@/i18n/I18nProvider';
import { formatClock, formatDateOnly, formatDayMonth } from '@/i18n/format';

const dayKey = (iso: string) => new Date(iso).toDateString();

export default function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  const { locale, dir, dict } = useI18n();

  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-gray-500">{dict.trend.needTwo}</p>;
  }

  const data = points.map((p, i) => {
    const previous = points[i - 1];
    
    const isNewDay = !previous || dayKey(previous.createdAt) !== dayKey(p.createdAt);
    const label = isNewDay
      ? formatDayMonth(locale, p.createdAt)
      : formatClock(locale, p.createdAt);
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
                    dir={dir}
                    className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm"
                  >
                    <p className="mb-1 font-medium">
                      {formatDateOnly(locale, point.createdAt)} —{' '}
                      {formatClock(locale, point.createdAt)}
                    </p>
                    <p>
                      {dict.trend.score} <span className="font-bold">{point.averageScore}</span>/100
                    </p>
                    <p className="text-gray-500">{dict.trend.pages(point.pageCount)}</p>
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
      <p className="mt-3 text-xs text-gray-500">{dict.trend.note}</p>
    </div>
  );
}
