'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useGetScoreHistoryQuery,
  useGetSiteScanQuery,
  useStartScanMutation,
} from '@/store/api';
import { countStatuses, labelFor, sortChecks } from '@/lib/checks';
import Header from '@/components/Header';
import LocaleLink from '@/components/LocaleLink';
import PageChecks from '@/components/PageChecks';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateMedium } from '@/i18n/format';
import type { Scan } from '@/types';

const CARD: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-lowest)',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
};

function normaliseUrl(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function siteHost(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host;
  } catch {
    return url;
  }
}

function scoreTone(score: number) {
  if (score >= 80) return 'var(--color-secondary)';
  if (score >= 60) return '#92400e';
  return 'var(--color-error)';
}

type PillTone = 'fail' | 'warning' | 'pass' | 'unknown';

const PILL_TONES: Record<PillTone, { bg: string; color: string; dot: string }> = {
  fail: {
    bg: 'color-mix(in srgb, var(--color-error-container) 70%, transparent)',
    color: 'var(--color-on-error-container)',
    dot: 'var(--color-error)',
  },
  warning: { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
  pass: {
    bg: 'color-mix(in srgb, var(--color-secondary-container) 55%, transparent)',
    color: 'var(--color-on-secondary-fixed-variant)',
    dot: 'var(--color-secondary)',
  },
  unknown: {
    bg: 'var(--color-surface-container-high)',
    color: 'var(--color-tertiary)',
    dot: 'var(--color-outline)',
  },
};

function CountPill({ label, tone }: { label: string; tone: PillTone }) {
  const meta = PILL_TONES[tone];
  return (
    <span className="pd-pill" style={{ backgroundColor: meta.bg, color: meta.color }}>
      <span className="pd-dot" style={{ backgroundColor: meta.dot }} />
      {label}
    </span>
  );
}

const PAGE_STYLES = `
  .pd-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-on-surface-variant);
  }
  .pd-back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: none;
  }
  .pd-back-link:hover { text-decoration: underline; }
  .pd-back-link .material-symbols-outlined { font-size: 18px; }
  .pd-crumb { color: var(--color-on-surface-variant); text-decoration: none; }
  a.pd-crumb:hover { color: var(--color-on-surface); }
  .pd-crumb-host { font-family: var(--font-jetbrains), monospace; font-size: 12px; }
  .pd-current { color: var(--color-on-surface); font-weight: 700; }
  .pd-sep { color: var(--color-outline-variant); }
  .pd-id {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background-color: var(--color-surface-container-low);
    color: var(--color-outline);
    font-size: 11px;
    font-weight: 600;
  }
  .pd-id .material-symbols-outlined { font-size: 14px; color: var(--color-primary); }
  .pd-mono { font-family: var(--font-jetbrains), monospace; color: var(--color-on-surface); }

  .pd-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px;
    border-radius: 12px;
    color: var(--color-on-primary);
    background: linear-gradient(100deg, var(--color-primary) 0%, var(--color-primary-container) 55%, var(--color-primary) 100%);
    box-shadow: 0 2px 12px color-mix(in srgb, var(--color-primary) 22%, transparent);
  }
  .pd-banner-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.16);
    flex-shrink: 0;
  }
  .pd-banner-icon .material-symbols-outlined { font-size: 24px; color: #fff; }
  .pd-banner-title { font-size: 18px; font-weight: 700; color: #fff; }
  .pd-banner-date,
  .pd-banner-see {
    padding: 2px 8px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.18);
    font-size: 11px;
    font-weight: 600;
  }
  .pd-banner-see { font-weight: 700; }
  .pd-delta {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    border-radius: 999px;
    background-color: var(--color-secondary-container);
    color: var(--color-on-secondary-fixed);
    font-size: 11px;
    font-weight: 700;
  }
  .pd-delta .material-symbols-outlined { font-size: 13px; }
  .pd-banner-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: var(--color-surface-container-lowest);
    color: var(--color-primary);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    transition: background-color 0.15s;
  }
  .pd-banner-btn:hover { background-color: var(--color-surface-container-low); }
  .pd-banner-btn .material-symbols-outlined { font-size: 16px; }
  .pd-banner-close {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.14);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s;
  }
  .pd-banner-close:hover { background-color: rgba(255, 255, 255, 0.26); }

  .pd-label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-on-surface-variant);
  }
  .pd-label .material-symbols-outlined { font-size: 16px; color: var(--color-primary); }
  .pd-url-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background-color: var(--color-surface-container-low);
  }
  .pd-url-text {
    min-width: 0;
    font-family: var(--font-jetbrains), monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-primary);
    word-break: break-all;
    user-select: all;
  }
  .pd-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: var(--color-surface-container-lowest);
    color: var(--color-on-surface-variant);
    flex-shrink: 0;
    transition: background-color 0.15s;
  }
  .pd-copy-btn:hover { background-color: var(--color-surface-container-high); }
  .pd-copy-btn .material-symbols-outlined { font-size: 18px; }
  .pd-copied { font-size: 11px; font-weight: 700; color: var(--color-secondary); }

  .pd-primary-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 14px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background-color: var(--color-primary-container);
    color: var(--color-on-primary);
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    transition: background-color 0.15s;
  }
  .pd-primary-btn:hover:not(:disabled) { background-color: var(--color-primary); }
  .pd-primary-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .pd-secondary-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 14px;
    border-radius: 8px;
    text-decoration: none;
    background-color: var(--color-surface-container-low);
    color: var(--color-on-surface);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    transition: background-color 0.15s;
  }
  .pd-secondary-btn:hover { background-color: var(--color-surface-container-high); }
  .pd-secondary-btn .material-symbols-outlined,
  .pd-primary-btn .material-symbols-outlined { font-size: 18px; }

  .pd-score-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid color-mix(in srgb, var(--color-outline-variant) 45%, transparent);
  }
  .pd-score-cap { font-size: 11px; font-weight: 600; color: var(--color-on-surface-variant); }
  .pd-score { font-size: 38px; line-height: 1.1; font-weight: 800; font-family: var(--font-jetbrains), monospace; }
  .pd-score-max { font-size: 18px; font-weight: 700; color: var(--color-outline); }
  .pd-divider {
    width: 1px;
    height: 34px;
    background-color: color-mix(in srgb, var(--color-outline-variant) 60%, transparent);
  }
  .pd-score-note { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
  .pd-score-note .pd-dot { width: 8px; height: 8px; border-radius: 50%; }
  .pd-score-sub { font-size: 12px; color: var(--color-on-surface-variant); overflow-wrap: anywhere; }
  .pd-flag {
    padding: 2px 8px;
    border-radius: 999px;
    background-color: var(--color-primary-fixed);
    color: var(--color-on-primary-fixed);
    font-size: 11px;
    font-weight: 700;
  }
  .pd-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .pd-pill .pd-dot { width: 7px; height: 7px; border-radius: 50%; }

  .pd-newer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #fde68a;
    background-color: #fffbeb;
    color: #92400e;
    font-size: 12px;
  }
  .pd-newer .material-symbols-outlined { font-size: 16px; }
  .pd-newer-btn {
    margin-inline-start: auto;
    padding: 6px 10px;
    border-radius: 6px;
    background-color: var(--color-surface-container-lowest);
    color: #92400e;
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }
  .pd-newer-btn:hover { background-color: #fef3c7; }

  .pd-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--color-outline-variant) 35%, transparent);
    background-color: color-mix(in srgb, var(--color-surface-container-low) 85%, transparent);
    font-size: 12px;
    color: var(--color-on-surface-variant);
  }
  .pd-footer .material-symbols-outlined { font-size: 16px; color: var(--color-tertiary); }
  .pd-footer-chip {
    padding: 2px 8px;
    border-radius: 4px;
    background-color: var(--color-primary-fixed);
    color: var(--color-on-primary-fixed);
    font-size: 11px;
    font-weight: 700;
  }
  .pd-engine {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-jetbrains), monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-primary);
  }
  .pd-engine .pd-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--color-primary);
    animation: ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  .pd-check-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 20px;
    border: none;
    background: none;
    font-family: inherit;
    text-align: start;
    cursor: pointer;
  }
  .pd-check-head:disabled { cursor: default; }
  .pd-check-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-inline-start: auto;
    flex-shrink: 0;
  }
  .pd-chevron { transition: transform 0.2s; }

  .pd-segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px;
    border-radius: 10px;
    background-color: var(--color-surface-container);
  }
  .pd-seg-btn {
    padding: 7px 12px;
    border: none;
    border-radius: 7px;
    background: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-on-surface-variant);
    white-space: nowrap;
    transition: background-color 0.15s, color 0.15s;
  }
  .pd-seg-btn:hover { color: var(--color-on-surface); }
  .pd-seg-btn-active {
    background-color: var(--color-surface-container-lowest);
    color: var(--color-on-surface);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }

  @media (max-width: 640px) {
    .pd-divider { display: none; }
    .pd-check-head { padding: 16px; }
    .pd-segmented { width: 100%; }
    .pd-seg-btn { flex: 1; text-align: center; }
    .pd-newer-btn { margin-inline-start: 0; }
  }
`;

export default function PageDetails() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { dir, dict } = useI18n();
  const copy = dict.pageDetail;

  const { data, isLoading } = useGetSiteScanQuery(id);
  const { data: history } = useGetScoreHistoryQuery(id);
  const scans = useMemo(() => data?.scans ?? [], [data]);
  const scan = scans.find((s) => s.id === pageId);

  if (isLoading) {
    return (
      <>
        <Header />
        <main style={{ position: 'relative', paddingTop: 64, minHeight: 'calc(100vh - 64px)', backgroundColor: 'var(--color-surface)' }}>
          <style>{PAGE_STYLES}</style>
          <div aria-hidden className="scan-dot-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4 }} />
          <div className="scan-shell" style={{ position: 'relative', maxWidth: 1024, margin: '0 auto', padding: '32px 32px 48px' }}>
            <div style={{ ...CARD, padding: 48, textAlign: 'center' }}>{dict.common.loading}</div>
          </div>
        </main>
      </>
    );
  }

  if (!scan) {
    return (
      <>
        <Header />
        <main style={{ position: 'relative', paddingTop: 64, minHeight: 'calc(100vh - 64px)', backgroundColor: 'var(--color-surface)' }}>
          <style>{PAGE_STYLES}</style>
          <div aria-hidden className="scan-dot-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4 }} />
          <div
            className="scan-shell"
            style={{ position: 'relative', maxWidth: 1024, margin: '0 auto', padding: '32px 32px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ ...CARD, padding: 48, textAlign: 'center', color: 'var(--color-error)' }}>
              {dict.common.pageNotFound}
            </div>
            <LocaleLink href={`/scans/${id}`} className="pd-back-link" style={{ alignSelf: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {dir === 'rtl' ? 'arrow_forward' : 'arrow_back'}
              </span>
              <span>{copy.back}</span>
            </LocaleLink>
          </div>
        </main>
      </>
    );
  }

  return (
    <PageDetailsView
      key={pageId}
      siteScanId={id}
      pageId={pageId}
      scans={scans}
      siteUrl={history?.url ?? null}
    />
  );
}

function PageDetailsView({
  siteScanId,
  pageId,
  scans,
  siteUrl,
}: {
  siteScanId: string;
  pageId: string;
  scans: Scan[];
  siteUrl: string | null;
}) {
  const router = useRouter();
  const { locale, dir, dict } = useI18n();
  const copy = dict.pageDetail;

  const [startScan, { isLoading: rescanning }] = useStartScanMutation();
  const [bannerVisible, setBannerVisible] = useState(true);
  const [showPrevious, setShowPrevious] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rescanError, setRescanError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const scan = scans.find((s) => s.id === pageId);
  if (!scan) return null;

  const previous = scan.previousScanId
    ? scans.find((s) => s.id === scan.previousScanId)
    : undefined;

  const sameVersion =
    !!previous &&
    !!scan.analyzerVersion &&
    scan.analyzerVersion === previous.analyzerVersion;

  const delta = previous && sameVersion ? scan.score - previous.score : null;

  const sameUrl = scans.filter((s) => normaliseUrl(s.url) === normaliseUrl(scan.url));
  const latest = sameUrl.reduce<Scan | null>(
    (a, b) => (!a || b.createdAt > a.createdAt ? b : a),
    null,
  );
  const newer = latest && latest.id !== scan.id && latest.triggeredBy === 'agent_rescan' ? latest : null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(scan.url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
    }
  };

  const onRescan = async () => {
    if (!siteUrl) return;
    setRescanError(false);
    try {
      const result = await startScan({ url: siteUrl }).unwrap();
      router.push(`/${locale}/scans/${result.siteScanId}`);
    } catch {
      setRescanError(true);
    }
  };

  const displayed = showPrevious && previous ? previous : scan;
  const counts = countStatuses(displayed.results);
  const sorted = sortChecks(displayed.results);
  const topIssue = sorted.find((r) => r.status === 'fail' || r.status === 'warning') ?? null;
  const quality =
    displayed.score >= 80 ? copy.scoreGood : displayed.score >= 60 ? copy.scoreFair : copy.scorePoor;
  const toneColor = scoreTone(displayed.score);

  return (
    <>
      <Header />
      <main style={{ position: 'relative', paddingTop: 64, minHeight: 'calc(100vh - 64px)', backgroundColor: 'var(--color-surface)' }}>
        <style>{PAGE_STYLES}</style>
        <div aria-hidden className="scan-dot-grid" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4 }} />

        <div
          className="scan-shell"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 1024,
            margin: '0 auto',
            padding: '24px 32px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* ── Breadcrumb & scan id ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <nav className="pd-breadcrumb">
              <LocaleLink href={`/scans/${siteScanId}`} className="pd-back-link">
                <span className="material-symbols-outlined">
                  {dir === 'rtl' ? 'arrow_forward' : 'arrow_back'}
                </span>
                <span>{copy.back}</span>
              </LocaleLink>
              <span className="pd-sep">/</span>
              <LocaleLink href="/" className="pd-crumb">
                {dict.nav.home}
              </LocaleLink>
              <span className="pd-sep">/</span>
              <span className="pd-crumb pd-crumb-host" dir="ltr">
                {siteHost(siteUrl ?? scan.url)}
              </span>
              <span className="pd-sep">/</span>
              <span className="pd-current">{copy.breadcrumb}</span>
            </nav>

            <span className="pd-id" title={scan.id}>
              <span className="material-symbols-outlined">verified</span>
              <span>
                {copy.scanId}:{' '}
                <span className="pd-mono" dir="ltr">
                  {scan.id.slice(0, 8).toUpperCase()}
                </span>
              </span>
            </span>
          </div>

          {/* ── Re-scan comparison banner ── */}
          {previous && bannerVisible && (
            <div className="pd-banner">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <div className="pd-banner-icon">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span className="pd-banner-title">{copy.rescanTitle(scan.score)}</span>
                    {delta != null && delta !== 0 && (
                      <span className="pd-delta">
                        <span className="material-symbols-outlined">
                          {delta > 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        {copy.rescanDelta(delta)}
                      </span>
                    )}
                    <span className="pd-banner-date">{formatDateMedium(locale, scan.createdAt)}</span>
                    {showPrevious && <span className="pd-banner-see">{copy.viewingPrevious}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.9, color: 'var(--color-on-primary-container)', maxWidth: 620 }}>
                    {sameVersion
                      ? copy.rescanBody(delta ?? 0, previous.score)
                      : copy.rescanBodyVersion}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {sameVersion && (
                  <button
                    type="button"
                    className="pd-banner-btn"
                    onClick={() => setShowPrevious((value) => !value)}
                  >
                    {showPrevious ? copy.compareBack(scan.score) : copy.compareCta(previous.score)}
                    <span className="material-symbols-outlined">compare_arrows</span>
                  </button>
                )}
                <button
                  type="button"
                  className="pd-banner-close"
                  title={copy.dismiss}
                  aria-label={copy.dismiss}
                  onClick={() => {
                    setBannerVisible(false);
                    setShowPrevious(false);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    close
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── URL, actions & score summary ── */}
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: '1 1 360px', minWidth: 0 }}>
                <div className="pd-label">
                  <span className="material-symbols-outlined">link</span>
                  <span>{copy.targetUrl}</span>
                </div>
                <div className="pd-url-box">
                  <span className="pd-url-text" dir="ltr">
                    {scan.url}
                  </span>
                  <button
                    type="button"
                    className="pd-copy-btn"
                    onClick={onCopy}
                    title={copy.copyUrl}
                    aria-label={copy.copyUrl}
                  >
                    <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
                    {copied && <span className="pd-copied">{copy.copied}</span>}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="pd-primary-btn"
                  onClick={onRescan}
                  disabled={rescanning || !siteUrl}
                >
                  <span
                    className="material-symbols-outlined"
                    style={rescanning ? { animation: 'spin 1s linear infinite' } : undefined}
                  >
                    {rescanning ? 'progress_activity' : 'refresh'}
                  </span>
                  <span>{rescanning ? copy.rescanningSite : copy.rescanSite}</span>
                </button>
                <a
                  className="pd-secondary-btn"
                  href={scan.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{copy.openExternal}</span>
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
              </div>
            </div>

            {rescanError && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error)' }}>{copy.rescanError}</p>
            )}

            <div className="pd-score-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="pd-score-cap">
                    {showPrevious ? copy.previousPageScore : copy.pageScore}
                  </span>
                  <div dir="ltr" style={{ display: 'flex', alignItems: 'baseline', gap: 4, alignSelf: 'flex-start' }}>
                    <span className="pd-score" style={{ color: toneColor }}>
                      {displayed.score}
                    </span>
                    <span className="pd-score-max">/100</span>
                  </div>
                </div>
                <span className="pd-divider" aria-hidden />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="pd-score-note" style={{ color: toneColor }}>
                    <span className="pd-dot" style={{ backgroundColor: toneColor }} />
                    {quality}
                  </span>
                  <span className="pd-score-sub">
                    {topIssue ? copy.topIssue(labelFor(dict, topIssue.check)) : copy.allClear}
                  </span>
                </div>
                {showPrevious && <span className="pd-flag">{copy.viewingPrevious}</span>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {counts.fail > 0 && <CountPill label={copy.failPill(counts.fail)} tone="fail" />}
                {counts.warning > 0 && <CountPill label={copy.warningPill(counts.warning)} tone="warning" />}
                {counts.pass > 0 && <CountPill label={copy.passPill(counts.pass)} tone="pass" />}
                {counts.unknown > 0 && <CountPill label={copy.unmeasuredPill(counts.unknown)} tone="unknown" />}
              </div>
            </div>

            {newer && (
              <div className="pd-newer">
                <span className="material-symbols-outlined">history</span>
                <span>{copy.newerRescan(formatDateMedium(locale, newer.createdAt))}</span>
                <LocaleLink href={`/scans/${siteScanId}/pages/${newer.id}`} className="pd-newer-btn">
                  {copy.openLatest(newer.score)}
                </LocaleLink>
              </div>
            )}
          </div>

          {/* ── Checks ── */}
          <PageChecks key={displayed.id} results={displayed.results} />

          {/* ── Footer metadata ── */}
          <div className="pd-footer">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined">calendar_clock</span>
              <span>
                {copy.footerScannedAt}{' '}
                <strong style={{ color: 'var(--color-on-surface)' }}>
                  {formatDateMedium(locale, scan.createdAt)}
                </strong>
              </span>
              {scan.triggeredBy === 'agent_rescan' && <span className="pd-footer-chip">{copy.rescanTag}</span>}
            </div>
            <div className="pd-engine">
              <span className="pd-dot" />
              <span dir="auto">{copy.footerEngine(scan.analyzerVersion ?? null)}</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
