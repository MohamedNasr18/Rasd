'use client';

import { STATUS_META } from '@/lib/checks';
import type { CheckStatus } from '@/types';
import { useI18n } from '@/i18n/I18nProvider';

export default function StatusBadge({ status }: { status: CheckStatus }) {
  const { dict } = useI18n();
  const m = STATUS_META[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.badge}`}>
      {dict.checks.status[status]}
    </span>
  );
}
