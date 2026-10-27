import { STATUS_META } from '@/lib/checks';
import type { CheckStatus } from '@/types';

export default function StatusBadge({ status }: { status: CheckStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.badge}`}>
      {m.label}
    </span>
  );
}