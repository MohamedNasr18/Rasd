'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useGetScoreHistoryQuery,
  useGetSiteScanQuery,
  useStartScanMutation,
} from '@/store/api';
import { countStatuses, scoreColor } from '@/lib/checks';
import CheckList from '@/components/CheckList';
import PagesTable from '@/components/PagesTable';
import StatusChart from '@/components/StatusChart';
import ScoreTrendChart from '@/components/ScoreTrendChart';
import ReportSection from '@/components/ReportSection';
import ChatPanel from '@/components/ChatPanel';
import Header from '@/components/Header';
import LocaleLink from '@/components/LocaleLink';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateMedium } from '@/i18n/format';
import type { PageStage, Scan, ScanStatus } from '@/types';

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

const CARD: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-lowest)',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
};

const MONO: CSSProperties = {
  fontFamily: 'var(--font-jetbrains), monospace',
};

function useElapsed(startIso: string | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!startIso) return '00:00';
  const seconds = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function useNow(active: boolean, intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}

const STATUS_META: Record<
  ScanStatus,
  { bg: string; border: string; color: string; dot: string; pulse: boolean }
> = {
  completed: { bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', dot: '#10b981', pulse: false },
  processing: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', dot: '#2563eb', pulse: true },
  failed: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b', dot: '#ef4444', pulse: false },
};

function StatusPill({ status }: { status: ScanStatus }) {
  const { dict } = useI18n();
  const meta = STATUS_META[status];
  const label =
    status === 'completed'
      ? dict.home.status.completed
      : status === 'processing'
        ? dict.home.status.processing
        : dict.home.status.failed;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '16px',
        backgroundColor: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.color,
        flexShrink: 0,
      }}
    >
      <span
        className={meta.pulse ? 'animate-ping-slow' : undefined}
        style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: meta.dot }}
      />
      {label}
    </span>
  );
}

type TaskTone = 'done' | 'running' | 'pending' | 'failed';

const TASK_TONES: Record<
  TaskTone,
  { circle: string; icon: string; badgeBg: string; badgeColor: string; dot: string }
> = {
  done: {
    circle: 'color-mix(in srgb, var(--color-secondary-fixed) 50%, transparent)',
    icon: 'var(--color-secondary)',
    badgeBg: 'color-mix(in srgb, var(--color-secondary-fixed) 30%, transparent)',
    badgeColor: 'var(--color-secondary)',
    dot: 'var(--color-secondary)',
  },
  running: {
    circle: 'var(--color-primary-fixed)',
    icon: 'var(--color-primary)',
    badgeBg: 'var(--color-primary-fixed)',
    badgeColor: 'var(--color-primary)',
    dot: 'var(--color-primary-container)',
  },
  pending: {
    circle: 'var(--color-surface-container)',
    icon: 'var(--color-outline)',
    badgeBg: 'var(--color-surface-container)',
    badgeColor: 'var(--color-on-surface-variant)',
    dot: 'var(--color-outline)',
  },
  failed: {
    circle: 'var(--color-error-container)',
    icon: 'var(--color-error)',
    badgeBg: 'var(--color-error-container)',
    badgeColor: 'var(--color-error)',
    dot: 'var(--color-error)',
  },
};

const STAGE_ICONS: Record<PageStage, string> = {
  queued: 'schedule',
  rendering: 'web',
  analyzing: 'search',
  speed: 'speed',
  links: 'link',
  saving: 'save',
  done: 'check',
  failed: 'error',
};

function TaskRow({
  icon,
  title,
  subtitle,
  badge,
  tone,
  ltr,
  spin,
  alert,
}: {
  icon: string;
  title: string;
  subtitle: string;
  badge: string;
  tone: TaskTone;
  ltr?: boolean;
  spin?: boolean;
  alert?: boolean;
}) {
  const meta = TASK_TONES[tone];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        backgroundColor:
          tone === 'running'
            ? 'var(--color-surface-container-low)'
            : 'var(--color-surface-container-lowest)',
        opacity: tone === 'pending' ? 0.7 : 1,
        boxShadow: tone === 'running' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: meta.circle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 18,
              color: meta.icon,
              ...(spin ? { animation: 'spin 1s linear infinite' } : {}),
            }}
          >
            {icon}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            dir={ltr ? 'ltr' : undefined}
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: alert
                ? '#b45309'
                : tone === 'running'
                  ? 'var(--color-primary)'
                  : 'var(--color-on-surface-variant)',
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          backgroundColor: meta.badgeBg,
          color: meta.badgeColor,
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span
          className={tone === 'running' ? 'animate-ping-slow' : undefined}
          style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.dot }}
        />
        {badge}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  ltr,
  error,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  error?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'var(--color-surface-container-low)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <span
        dir={ltr ? 'ltr' : undefined}
        style={{
          ...MONO,
          fontWeight: 600,
          color: error ? 'var(--color-error)' : 'var(--color-on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale, dir, dict } = useI18n();
  const copy = dict.scan;
  const { data, isLoading, error, refetch } = useGetSiteScanQuery(id);
  // Always fetched: the history payload is also where the target site URL lives.
  const { data: history } = useGetScoreHistoryQuery(id);
  const [startScan, { isLoading: retrying }] = useStartScanMutation();
  const [retryError, setRetryError] = useState(false);

  useEffect(() => {
    if (data?.status !== 'processing') return;
    const timer = setInterval(() => void refetch(), 2000);
    return () => clearInterval(timer);
  }, [data?.status, refetch]);

  const elapsed = useElapsed(data?.createdAt, data?.status === 'processing');
  const now = useNow(data?.status === 'processing');
  const progressRows = data?.progress ?? [];

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

  const siteUrl = history?.url ?? latestScans[0]?.url ?? '';
  const isHttps = siteUrl.startsWith('https://');

  const percent =
    data && data.pageCount > 0
      ? Math.round((data.completedPages / data.pageCount) * 100)
      : 0;
  const remainingPages = data ? Math.max(0, data.pageCount - data.completedPages) : 0;
  const headline = hasRescans ? currentAverage : data?.averageScore;

  const onRetry = async () => {
    if (!siteUrl) return;
    setRetryError(false);
    try {
      const res = await startScan({ url: siteUrl }).unwrap();
      router.push(`/${locale}/scans/${res.siteScanId}`);
    } catch {
      setRetryError(true);
    }
  };

  return (
    <>
      <Header />
      <main
        style={{
          position: 'relative',
          paddingTop: 64,
          minHeight: 'calc(100vh - 64px)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <style>{`
          .scan-back-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            align-self: flex-start;
            color: var(--color-on-surface-variant);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: color 0.15s;
          }
          .scan-back-link:hover { color: var(--color-primary); }
          .scan-back-link .material-symbols-outlined { transition: transform 0.15s; }
          html[dir='rtl'] .scan-back-link:hover .material-symbols-outlined { transform: translateX(3px); }
          html[dir='ltr'] .scan-back-link:hover .material-symbols-outlined { transform: translateX(-3px); }
          .scan-retry-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            background-color: var(--color-primary-container);
            color: var(--color-on-primary);
            font-size: 16px;
            font-weight: 600;
            transition: background-color 0.15s;
          }
          .scan-retry-btn:hover:not(:disabled) { background-color: var(--color-primary); }
          .scan-retry-btn:disabled { opacity: 0.7; cursor: not-allowed; }
          .scan-home-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            border-radius: 8px;
            text-decoration: none;
            background-color: var(--color-surface-container-lowest);
            color: var(--color-on-surface);
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            transition: background-color 0.15s;
          }
          .scan-home-btn:hover { background-color: var(--color-surface-container-low); }
        `}</style>

        <div
          aria-hidden
          className="scan-dot-grid"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4 }}
        />

        <div
          className="scan-shell"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 1024,
            margin: '0 auto',
            padding: '32px 32px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* ── Page heading ── */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <LocaleLink href="/" className="scan-back-link">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {dir === 'rtl' ? 'arrow_forward' : 'arrow_back'}
                </span>
                <span>{copy.backHome}</span>
              </LocaleLink>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(24px, 4vw, 30px)',
                  lineHeight: 1.35,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                }}
              >
                {copy.title}
              </h1>
            </div>
            {data && <StatusPill status={data.status} />}
          </div>

          {isLoading && (
            <div style={{ ...CARD, padding: 48, textAlign: 'center' }}>
              {dict.common.loading}
            </div>
          )}

          {!isLoading && (error || !data) && (
            <div style={{ ...CARD, padding: 48, textAlign: 'center', color: 'var(--color-error)' }}>
              {dict.common.scanNotFound}
            </div>
          )}

          {!isLoading && data && (
            <>
              {/* ── Target URL inspector ── */}
              <div
                style={{
                  ...CARD,
                  padding: 16,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      backgroundColor: 'var(--color-surface-container)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 22, color: 'var(--color-primary)' }}
                    >
                      language
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
                      {copy.targetSite}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      <span
                        dir="ltr"
                        style={{
                          ...MONO,
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-on-surface)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 'min(62vw, 460px)',
                        }}
                      >
                        {siteUrl || '—'}
                      </span>
                      {isHttps && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 999,
                            backgroundColor: 'var(--color-surface-container-low)',
                            color: 'var(--color-secondary)',
                            fontSize: 11,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                            lock
                          </span>
                          <span dir="ltr">SSL/TLS</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    flexWrap: 'wrap',
                    fontSize: 13,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-tertiary)' }}>
                      dns
                    </span>
                    {copy.engine}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-tertiary)' }}>
                      schedule
                    </span>
                    {data.status === 'processing' ? (
                      <span dir="ltr" style={{ ...MONO, fontWeight: 600 }}>
                        {elapsed}
                      </span>
                    ) : (
                      formatDateMedium(locale, data.createdAt)
                    )}
                  </span>
                </div>
              </div>

              {/* ── Processing ── */}
              {data.status === 'processing' && (
                <>
                  <div style={{ ...CARD, position: 'relative', overflow: 'hidden' }}>
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: -96,
                        insetInlineStart: -96,
                        width: 256,
                        height: 256,
                        borderRadius: '50%',
                        backgroundColor: 'color-mix(in srgb, var(--color-primary-fixed) 45%, transparent)',
                        filter: 'blur(48px)',
                        pointerEvents: 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 20,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              position: 'relative',
                              width: 48,
                              height: 48,
                              borderRadius: 12,
                              backgroundColor: 'var(--color-primary-fixed)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              className="material-symbols-outlined scan-spin-slow"
                              style={{ fontSize: 26, color: 'var(--color-primary)' }}
                            >
                              sync
                            </span>
                            <span
                              style={{
                                position: 'absolute',
                                top: -4,
                                insetInlineEnd: -4,
                                display: 'flex',
                                width: 12,
                                height: 12,
                              }}
                            >
                              <span
                                className="animate-ping-slow"
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--color-primary-container)',
                                  opacity: 0.75,
                                }}
                              />
                              <span
                                style={{
                                  position: 'relative',
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--color-primary-container)',
                                }}
                              />
                            </span>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
                                {copy.analyzingTitle}
                              </h2>
                              <span
                                style={{
                                  padding: '2px 10px',
                                  borderRadius: 999,
                                  backgroundColor: 'var(--color-primary-fixed)',
                                  color: 'var(--color-on-primary-fixed)',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {copy.pagesCounter(data.completedPages, data.pageCount)}
                              </span>
                            </div>
                            <p
                              style={{
                                margin: '4px 0 0',
                                fontSize: 14,
                                color: 'var(--color-on-surface-variant)',
                              }}
                            >
                              {copy.analyzingHint}
                            </p>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 12px',
                            borderRadius: 999,
                            backgroundColor: 'var(--color-surface-container-low)',
                            fontSize: 13,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>
                            hourglass_top
                          </span>
                          <span style={{ fontWeight: 600 }}>
                            {copy.elapsed}{' '}
                            <span dir="ltr" style={MONO}>
                              {elapsed}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                            fontSize: 13,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{copy.overallProgress}</span>
                          <span
                            dir="ltr"
                            style={{ ...MONO, fontWeight: 700, color: 'var(--color-primary)' }}
                          >
                            {percent}%
                          </span>
                        </div>
                        <div
                          style={{
                            height: 12,
                            borderRadius: 999,
                            backgroundColor: 'var(--color-surface-container)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              position: 'relative',
                              height: '100%',
                              width: `${percent}%`,
                              borderRadius: 999,
                              backgroundColor: 'var(--color-primary-container)',
                              overflow: 'hidden',
                              transition: 'width 0.7s ease-out',
                            }}
                          >
                            <div
                              className="scan-shimmer"
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background:
                                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: 12,
                        }}
                      >
                        {[
                          {
                            label: copy.pagesDone,
                            value: `${data.completedPages}/${data.pageCount}`,
                            icon: 'bolt',
                            color: 'var(--color-secondary)',
                          },
                          {
                            label: copy.pagesRemaining,
                            value: String(remainingPages),
                            icon: 'account_tree',
                            color: 'var(--color-primary)',
                          },
                          {
                            label: copy.scanStatus,
                            value: copy.inProgress,
                            icon: 'verified',
                            color: 'var(--color-secondary)',
                          },
                        ].map((tile) => (
                          <div
                            key={tile.label}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              padding: 12,
                              borderRadius: 8,
                              backgroundColor:
                                'color-mix(in srgb, var(--color-surface-container-low) 70%, transparent)',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>
                                {tile.label}
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{tile.value}</span>
                            </div>
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 20, color: tile.color }}
                            >
                              {tile.icon}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={CARD}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{copy.progressTitle}</h3>
                      <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)' }}>
                        {copy.liveRefresh}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {progressRows.length > 0
                        ? progressRows.map((row) => {
                            const stage = row.stage;
                            const tone: TaskTone =
                              stage === 'done'
                                ? 'done'
                                : stage === 'failed'
                                  ? 'failed'
                                  : stage === 'queued'
                                    ? 'pending'
                                    : 'running';
                            const seconds = Math.max(
                              0,
                              Math.floor((now - new Date(row.updatedAt).getTime()) / 1000),
                            );
                            const subtitle =
                              row.kind === 'site'
                                ? tone === 'running'
                                  ? `${copy.siteChecksRowHint} · ${copy.lastUpdate(seconds)}`
                                  : copy.siteChecksRowHint
                                : stage === 'done'
                                  ? row.score != null
                                    ? copy.pageScore(row.score)
                                    : copy.stageLabels.done
                                  : stage === 'failed'
                                    ? copy.stageLabels.failed
                                    : stage === 'queued'
                                      ? copy.stageLabels.queued
                                      : `${copy.stageLabels[stage]} · ${copy.lastUpdate(seconds)}`;
                            const badge =
                              stage === 'done'
                                ? copy.taskDone
                                : stage === 'failed'
                                  ? copy.failedBadge
                                  : stage === 'queued'
                                    ? copy.taskPending
                                    : copy.taskRunning;

                            return (
                              <TaskRow
                                key={row.id}
                                icon={STAGE_ICONS[stage]}
                                tone={tone}
                                ltr={row.kind === 'page'}
                                title={row.kind === 'site' ? copy.siteChecksRow : row.url}
                                subtitle={subtitle}
                                badge={badge}
                                alert={tone === 'running' && seconds > 90}
                              />
                            );
                          })
                        : // Scans started before progress tracking existed.
                          latestScans.slice(0, 4).map((scan) => (
                            <TaskRow
                              key={scan.id}
                              icon="check"
                              tone="done"
                              ltr
                              title={scan.url}
                              subtitle={copy.pageScore(scan.score)}
                              badge={copy.taskDone}
                            />
                          ))}
                      {progressRows.length === 0 && remainingPages > 0 && (
                        <TaskRow
                          icon="progress_activity"
                          tone="running"
                          spin
                          title={copy.analyzingTitle}
                          subtitle={copy.remainingPages(remainingPages)}
                          badge={copy.taskRunning}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Failed ── */}
              {data.status === 'failed' && (
                <div
                  style={{
                    borderRadius: 12,
                    padding: 24,
                    backgroundColor:
                      'color-mix(in srgb, var(--color-error-container) 40%, transparent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        backgroundColor: 'var(--color-error-container)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 32, color: 'var(--color-error)' }}
                      >
                        error_outline
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: 20,
                            fontWeight: 700,
                            color: 'var(--color-on-error-container)',
                          }}
                        >
                          {copy.failed}
                        </h2>
                        <span
                          style={{
                            ...MONO,
                            padding: '2px 10px',
                            borderRadius: 999,
                            backgroundColor: 'var(--color-error)',
                            color: 'var(--color-on-error)',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {copy.failedBadge}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 16,
                          lineHeight: 1.8,
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        {copy.failedBody}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      ...CARD,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      {copy.detailsTitle}
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 12,
                      }}
                    >
                      <DetailRow label={copy.detailTarget} value={siteUrl || '—'} ltr />
                      <DetailRow label={copy.detailProtocol} value={isHttps ? 'HTTPS' : 'HTTP'} />
                      <DetailRow label={copy.detailStatus} value={copy.failedBadge} error />
                      <DetailRow
                        label={copy.detailTime}
                        value={formatDateMedium(locale, data.createdAt)}
                      />
                    </div>
                    {retryError && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-error)' }}>
                        {copy.retryError}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="scan-retry-btn"
                      onClick={onRetry}
                      disabled={retrying || !siteUrl}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 20,
                          ...(retrying ? { animation: 'spin 1s linear infinite' } : {}),
                        }}
                      >
                        {retrying ? 'progress_activity' : 'refresh'}
                      </span>
                      <span>{retrying ? copy.retrying : copy.retryNow}</span>
                    </button>
                    <LocaleLink href="/" className="scan-home-btn">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        home
                      </span>
                      <span>{copy.backHome}</span>
                    </LocaleLink>
                  </div>
                </div>
              )}

              {/* ── Completed ── */}
              {data.status === 'completed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 16,
                    }}
                  >
                    <div style={CARD}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
                        {hasRescans ? copy.currentScore : copy.totalScore}
                      </p>
                      <p
                        className={scoreColor(headline ?? 0)}
                        style={{ margin: '4px 0 0', fontSize: 56, lineHeight: 1.1, fontWeight: 700 }}
                      >
                        {headline ?? '—'}
                        <span style={{ fontSize: 20, color: 'var(--color-outline)' }}>/100</span>
                      </p>
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
                        {copy.pagesAnalyzed(latestScans.length)}
                      </p>
                      {hasRescans && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 8,
                            borderTop:
                              '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            fontSize: 12,
                            color: 'var(--color-on-surface-variant)',
                          }}
                        >
                          <p style={{ margin: 0 }}>
                            {copy.originalScore}{' '}
                            <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
                              {data.averageScore}/100
                            </span>{' '}
                            · {formatDateMedium(locale, data.createdAt)}
                          </p>
                          {lastRescanAt && (
                            <p style={{ margin: 0 }}>
                              {copy.lastRescan(formatDateMedium(locale, lastRescanAt))}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ ...CARD, padding: 16 }}>
                      <p
                        style={{
                          margin: '0 0 4px',
                          fontSize: 13,
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        {hasRescans ? copy.currentDistribution : copy.distribution}
                      </p>
                      <StatusChart counts={counts} />
                    </div>
                  </div>

                  {hasRescans && (
                    <p
                      style={{
                        margin: 0,
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid #fde68a',
                        backgroundColor: '#fffbeb',
                        color: '#92400e',
                        fontSize: 13,
                      }}
                    >
                      {copy.rescanNotice}
                    </p>
                  )}

                  <section style={CARD}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{copy.trend}</h2>
                    <p
                      dir="ltr"
                      style={{
                        ...MONO,
                        margin: '0 0 16px',
                        fontSize: 12,
                        color: 'var(--color-on-surface-variant)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {history?.url ?? ''}
                    </p>
                    {history ? (
                      <ScoreTrendChart points={history.points} />
                    ) : (
                      <p
                        style={{
                          padding: '24px 0',
                          textAlign: 'center',
                          fontSize: 13,
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        {dict.common.loading}
                      </p>
                    )}
                  </section>

                  {data.siteLevelResults && data.siteLevelResults.length > 0 && (
                    <section>
                      <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
                        {copy.siteChecks}
                      </h2>
                      <CheckList results={data.siteLevelResults} />
                    </section>
                  )}

                  <ReportSection
                    siteScanId={data.id}
                    rescanAt={lastRescanAt}
                    averageScore={data.averageScore}
                    pageCount={data.pageCount}
                    createdAt={data.createdAt}
                  />

                  <section>
                    <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
                      {copy.pages}
                    </h2>
                    <PagesTable
                      scans={latestScans}
                      siteScanId={data.id}
                      previousById={previousById}
                    />
                  </section>

                  <ChatPanel siteScanId={data.id} />
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingTop: 4,
                  fontSize: 13,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: 'var(--color-primary)' }}
                  >
                    security
                  </span>
                  <span>{copy.securityNote}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
