'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { STATUS_META } from '@/lib/checks';
import type { CheckStatus } from '@/types';

export default function StatusChart({ counts }: { counts: Record<CheckStatus, number> }) {
  const data = (Object.keys(counts) as CheckStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => ({ key: s, name: STATUS_META[s].label, value: counts[s] }));

  if (data.length === 0) return null;

  return (
    <div className="h-48 w-full" dir="ltr">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.key} fill={STATUS_META[d.key].color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}