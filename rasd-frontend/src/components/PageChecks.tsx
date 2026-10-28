'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { countStatuses, labelFor, sortChecks } from '@/lib/checks';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateMedium } from '@/i18n/format';
import type { Dictionary } from '@/i18n/dictionaries';
import type { CheckResult, CheckStatus } from '@/types';

const CARD: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-lowest)',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
};

const MONO: CSSProperties = {
  fontFamily: 'var(--font-jetbrains), monospace',
};

const TONES: Record<
  CheckStatus,
  { icon: string; iconBg: string; iconColor: string; pillBg: string; pillColor: string; dot: string }
> = {
  fail: {
    icon: 'cancel',
    iconBg: 'var(--color-error-container)',
    iconColor: 'var(--color-error)',
    pillBg: 'var(--color-error-container)',
    pillColor: 'var(--color-on-error-container)',
    dot: 'var(--color-error)',
  },
  warning: {
    icon: 'warning',
    iconBg: '#fef3c7',
    iconColor: '#b45309',
    pillBg: '#fffbeb',
    pillColor: '#92400e',
    dot: '#f59e0b',
  },
  unknown: {
    icon: 'help',
    iconBg: 'var(--color-surface-container-high)',
    iconColor: 'var(--color-tertiary)',
    pillBg: 'var(--color-surface-container-high)',
    pillColor: 'var(--color-tertiary)',
    dot: 'var(--color-outline)',
  },
  pass: {
    icon: 'check_circle',
    iconBg: 'color-mix(in srgb, var(--color-secondary-fixed) 45%, transparent)',
    iconColor: 'var(--color-secondary)',
    pillBg: 'color-mix(in srgb, var(--color-secondary-container) 60%, transparent)',
    pillColor: 'var(--color-on-secondary-fixed-variant)',
    dot: 'var(--color-secondary)',
  },
};

type Metric = { key?: string; value?: number; unit?: string; source?: string; rating?: string };
type BrokenLink = { link: string; status: number };

const CODE_KEYS = new Set([
  'title', 'description', 'canonical', 'pageUrl', 'url', 'content', 'metaCharset', 'headerContentType', 'word',
]);
const LIST_KEYS = new Set(['headings', 'samples', 'invalid', 'problems', 'types']);
const HANDLED_KEYS = new Set(['metrics', 'missing', 'broken', 'checked']);

const RATING_ORDER: Record<string, number> = { poor: 3, 'needs-improvement': 2, good: 1 };

function metricValue(metric: Metric) {
  const value = metric.value ?? 0;
  if (metric.key === 'cls') return value.toFixed(2);
  if (metric.key === 'lcp' || metric.unit === 's') return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function asDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const data = details as Record<string, unknown>;
  return Object.keys(data).length > 0 ? data : null;
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'warning' | 'error' | 'neutral' }) {
  const styles =
    tone === 'error'
      ? { bg: 'var(--color-error-container)', color: 'var(--color-on-error-container)' }
      : tone === 'warning'
        ? { bg: '#fffbeb', color: '#92400e' }
        : { bg: 'var(--color-surface-container-lowest)', color: 'var(--color-on-surface)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 6,
        backgroundColor: styles.bg,
        color: styles.color,
        fontSize: 11,
        fontWeight: 600,
        ...MONO,
        wordBreak: 'break-all',
      }}
    >
      {children}
    </span>
  );
}

function Row({ label, dir = 'auto', children }: { label: string; dir?: 'ltr' | 'rtl' | 'auto'; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <span dir={dir} style={{ ...MONO, fontWeight: 600, color: 'var(--color-on-surface)', wordBreak: 'break-all' }}>
        {children}
      </span>
    </div>
  );
}

function Details({ result }: { result: CheckResult }) {
  const { locale, dict } = useI18n();
  const copy = dict.pageDetail;
  const data = asDetails(result.details);
  if (!data) return null;

  const metrics = Array.isArray(data.metrics) ? (data.metrics as Metric[]) : [];
  const isCwv = Array.isArray(data.metrics);
  const missing = Array.isArray(data.missing) ? (data.missing as unknown[]).map(String) : [];
  const broken = Array.isArray(data.broken)
    ? (data.broken as BrokenLink[]).filter((entry) => entry && typeof entry.link === 'string')
    : [];
  const checked = typeof data.checked === 'number' ? data.checked : null;

  const codeRows = Object.entries(data).filter(
    ([key, value]) => CODE_KEYS.has(key) && typeof value === 'string' && value.length > 0,
  ) as Array<[string, string]>;

  const lists = Object.entries(data)
    .filter(([key]) => (LIST_KEYS.has(key) || (!isCwv && key === 'missing')))
    .map(([key, value]) => ({
      key,
      values: Array.isArray(value) ? (value as unknown[]).map(String).filter((v) => v.length > 0) : [],
    }))
    .filter((entry) => entry.values.length > 0);

  const rows = Object.entries(data).filter(
    ([key, value]) =>
      !HANDLED_KEYS.has(key) &&
      !CODE_KEYS.has(key) &&
      !LIST_KEYS.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !Array.isArray(value),
  ) as Array<[string, string | number | boolean]>;

  const valueText = (key: string, value: string | number | boolean) => {
    if (typeof value === 'boolean') return value ? copy.yes : copy.no;
    if (key === 'ratio' && typeof value === 'number') return `${(value * 100).toFixed(1)}%`;
    if (key === 'checkedAt' && typeof value === 'string') return formatDateMedium(locale, value);
    if (key === 'strategy') return copy.strategyLabels[String(value)] ?? String(value);
    return String(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {metrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-tertiary)', letterSpacing: '0.02em' }}>
            {copy.metricsTitle}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            {metrics.map((metric) => {
              const tone = TONES[metric.rating === 'poor' ? 'fail' : metric.rating === 'needs-improvement' ? 'warning' : 'pass'];
              return (
                <div
                  key={`${metric.key}-${metric.source ?? ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--color-surface-container-low)',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-tertiary)' }}>
                    {copy.metricLabels[metric.key ?? ''] ?? (metric.key ?? '').toUpperCase()}
                  </span>
                  <span dir="ltr" style={{ ...MONO, fontSize: 18, fontWeight: 700, color: tone.iconColor }}>
                    {metricValue(metric)}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ color: 'var(--color-outline)' }}>
                      {copy.metricSources[metric.source ?? ''] ?? metric.source}
                    </span>
                    <span style={{ color: tone.iconColor, fontWeight: 600 }}>
                      {copy.metricRatings[metric.rating ?? ''] ?? metric.rating}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isCwv && missing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-tertiary)' }}>
            {copy.notMeasuredMetrics}
          </span>
          {missing.map((key) => (
            <Chip key={key} tone="neutral">
              {key.toUpperCase()}
            </Chip>
          ))}
        </div>
      )}

      {broken.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'var(--color-surface-container-low)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-tertiary)',
            }}
          >
            <span>{copy.brokenLinksTitle}</span>
            {checked != null && <span>{copy.brokenChecked(checked)}</span>}
          </div>
          {broken.map((entry) => (
            <div
              key={entry.link}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: 8,
                borderRadius: 6,
                backgroundColor: 'var(--color-surface-container-lowest)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 220px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-outline)', flexShrink: 0 }}>
                  link_off
                </span>
                <span dir="ltr" style={{ ...MONO, fontSize: 12, wordBreak: 'break-all', color: 'var(--color-on-surface)' }}>
                  {entry.link}
                </span>
              </div>
              <span
                dir="ltr"
                style={{
                  ...MONO,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: 'var(--color-error-container)',
                  color: 'var(--color-on-error-container)',
                  flexShrink: 0,
                }}
              >
                {entry.status === 0 ? copy.brokenNoResponse : copy.httpStatus(entry.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isCwv && checked != null && broken.length === 0 && (
        <p style={{ ...MONO, margin: 0, fontSize: 11, color: 'var(--color-outline)' }}>
          {copy.brokenChecked(checked)}
        </p>
      )}

      {codeRows.map(([key, value]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'var(--color-surface-container-low)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-tertiary)' }}>
            {dict.checks.details[key] ?? key}
          </span>
          <code
            dir="ltr"
            style={{
              ...MONO,
              display: 'block',
              padding: 8,
              borderRadius: 6,
              backgroundColor: 'var(--color-surface-container-lowest)',
              color: 'var(--color-primary)',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {value}
          </code>
        </div>
      ))}

      {lists.map(({ key, values }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-tertiary)' }}>
            {dict.checks.details[key] ?? key}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {values.map((value, index) => (
              <Chip
                key={`${key}-${index}`}
                tone={key === 'missing' || key === 'invalid' || key === 'problems' ? 'warning' : 'neutral'}
              >
                {value}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      {rows.length > 0 && (
        <div
          style={{
            borderRadius: 8,
            backgroundColor: 'var(--color-surface-container-low)',
            padding: '4px 0',
          }}
        >
          {rows.map(([key, value], index) => (
            <div
              key={key}
              style={
                index < rows.length - 1
                  ? { borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 45%, transparent)' }
                  : undefined
              }
            >
              <Row
                label={dict.checks.details[key] ?? key}
                dir={key === 'checkedAt' ? (locale === 'ar' ? 'rtl' : 'ltr') : 'auto'}
              >
                {valueText(key, value)}
              </Row>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summaryChip(result: CheckResult, copy: Dictionary['pageDetail']) {
  const data = asDetails(result.details);
  if (!data) return result.weight ? copy.weightChip(result.weight) : null;

  if (result.check === 'core_web_vitals' && Array.isArray(data.metrics)) {
    const metrics = data.metrics as Metric[];
    if (metrics.length > 0) {
      const worst = metrics.reduce((a, b) =>
        (RATING_ORDER[b.rating ?? ''] ?? 0) > (RATING_ORDER[a.rating ?? ''] ?? 0) ? b : a,
      );
      return `${(worst.key ?? '').toUpperCase()} ${metricValue(worst)}`;
    }
  }
  if (result.check === 'broken_internal_links' && Array.isArray(data.broken) && data.broken.length > 0) {
    return copy.brokenChip(data.broken.length);
  }
  if (typeof data.length === 'number' && (result.check === 'title_tag' || result.check === 'meta_description')) {
    return copy.charsChip(data.length);
  }
  if (
    result.check === 'image_alt_tags' &&
    typeof data.missing === 'number' &&
    typeof data.total === 'number' &&
    data.total > 0
  ) {
    return copy.imagesChip(data.missing, data.total);
  }
  return result.weight ? copy.weightChip(result.weight) : null;
}

function CheckCard({ result }: { result: CheckResult }) {
  const { dict } = useI18n();
  const copy = dict.pageDetail;
  const [expanded, setExpanded] = useState(false);
  const tone = TONES[result.status];
  const hasDetails = asDetails(result.details) !== null;
  const chip = summaryChip(result, copy);

  return (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      <button
        type="button"
        className="pd-check-head"
        aria-expanded={hasDetails ? expanded : undefined}
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded((value) => !value)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: tone.iconBg,
              color: tone.iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {tone.icon}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.6 }}>
                {labelFor(dict, result.check)}
              </h3>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 9px',
                  borderRadius: 999,
                  backgroundColor: tone.pillBg,
                  color: tone.pillColor,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: tone.dot }} />
                {dict.checks.status[result.status]}
              </span>
            </div>
            <p
              dir="auto"
              style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--color-on-surface-variant)' }}
            >
              {result.message}
            </p>
          </div>
        </div>

        <div className="pd-check-meta">
          {chip && (
            <span
              dir="auto"
              style={{
                ...MONO,
                padding: '3px 8px',
                borderRadius: 6,
                backgroundColor: 'var(--color-surface-container-low)',
                color: 'var(--color-tertiary)',
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {chip}
            </span>
          )}
          {hasDetails && (
            <span
              className="material-symbols-outlined pd-chevron"
              style={{
                fontSize: 22,
                color: 'var(--color-outline)',
                transform: expanded ? 'rotate(180deg)' : 'none',
              }}
            >
              expand_more
            </span>
          )}
        </div>
      </button>

      {expanded && hasDetails && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-tertiary)', letterSpacing: '0.02em' }}>
            {copy.detailsTitle}
          </span>
          <Details result={result} />
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'issues' | 'passed';

export default function PageChecks({ results }: { results: CheckResult[] }) {
  const { dict } = useI18n();
  const copy = dict.pageDetail;
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = sortChecks(results);
  const counts = countStatuses(results);
  const issues = counts.fail + counts.warning;
  const total = results.length;

  const visible =
    filter === 'all'
      ? sorted
      : filter === 'issues'
        ? sorted.filter((r) => r.status === 'fail' || r.status === 'warning')
        : sorted.filter((r) => r.status === 'pass');

  const allFilters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: copy.filterAll(total), count: total },
    { id: 'issues', label: copy.filterIssues(issues), count: issues },
    { id: 'passed', label: copy.filterPassed(counts.pass), count: counts.pass },
  ];
  const filters = allFilters.filter((entry) => entry.id === 'all' || entry.count > 0);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--color-primary)' }}>
            fact_check
          </span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>{copy.checksTitle}</h2>
          <span
            style={{
              ...MONO,
              padding: '2px 8px',
              borderRadius: 6,
              backgroundColor: 'var(--color-surface-container)',
              color: 'var(--color-tertiary)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {copy.checksCount(total)}
          </span>
        </div>

        <div className="pd-segmented" role="group">
          {filters.map((entry) => {
            const active = filter === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={active ? 'pd-seg-btn pd-seg-btn-active' : 'pd-seg-btn'}
                aria-pressed={active}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map((result) => (
          <CheckCard key={result.check} result={result} />
        ))}
      </div>
    </section>
  );
}
