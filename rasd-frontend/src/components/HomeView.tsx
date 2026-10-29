'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useListSiteScansQuery, useStartScanMutation } from '@/store/api';
import type { SiteScanListItem } from '@/types';
import Header from '@/components/Header';
import LocaleLink from '@/components/LocaleLink';
import { useAuth } from '@/components/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Dictionary } from '@/i18n/dictionaries';

/* ─── helpers ─── */
function formatTime(copy: Dictionary['time'], iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return copy.now;
  if (diffMin < 60) return copy.minutesAgo(diffMin);
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return copy.hoursAgo(diffH);
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return copy.yesterday;
  return copy.daysAgo(diffD);
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'var(--color-secondary)'
      : score >= 60
      ? '#d97706'
      : 'var(--color-error)';
  const textColor =
    score >= 80 ? '#006c49' : score >= 60 ? '#b45309' : 'var(--color-error)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: '12px',
          fontWeight: 700,
          color: textColor,
        }}
      >
        {score} / 100
      </span>
      <div
        style={{
          width: 64,
          height: 8,
          backgroundColor: 'var(--color-surface-container)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            backgroundColor: color,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status, completed, total }: { status: string; completed?: number; total?: number }) {
  const { dict } = useI18n();
  const statusCopy = dict.home.status;

  if (status === 'completed') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 600, lineHeight: '16px',
        backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
        {statusCopy.completed}
      </span>
    );
  }
  if (status === 'processing') {
    const label = (completed !== undefined && total !== undefined)
      ? statusCopy.processingProgress(completed, total)
      : statusCopy.processing;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 600, lineHeight: '16px',
        backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
      }}>
        <svg style={{ animation: 'spin 1s linear infinite', width: 12, height: 12 }} fill="none" viewBox="0 0 24 24">
          <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor" />
        </svg>
        {label}
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, lineHeight: '16px',
      backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
      {statusCopy.failed}
    </span>
  );
}

function ScanRow({ scan }: { scan: SiteScanListItem }) {
  const { dict } = useI18n();
  return (
    <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 30%, transparent)' }}
      className="hover-scan-row">
      <td style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <LocaleLink
            href={`/scans/${scan.id}`}
            style={{
              fontFamily: 'var(--font-jetbrains), monospace',
              fontSize: 12, fontWeight: 500,
              color: 'var(--color-primary)',
              textDecoration: 'none',
              direction: 'ltr',
              display: 'block',
            }}
            className="hover-underline"
          >
            {scan.site.url}
          </LocaleLink>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-outline)' }}>public</span>
        </div>
      </td>
      <td style={{ padding: '16px 24px' }}>
        {scan.averageScore != null ? (
          <ScoreBar score={Math.round(scan.averageScore)} />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-outline)' }}>—</span>
        )}
      </td>
      <td style={{ padding: '16px 24px' }}>
        <StatusBadge
          status={scan.status}
          completed={scan.completedPages}
          total={scan.pageCount}
        />
      </td>
      <td style={{ padding: '16px 24px', fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
        {formatTime(dict.time, scan.createdAt)}
      </td>
      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
        {scan.status === 'completed' ? (
          <LocaleLink
            href={`/scans/${scan.id}`}
            style={{
              fontSize: 13, color: 'var(--color-primary)', fontWeight: 600,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            className="hover-underline"
          >
            <span>{dict.home.actions.openReport}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
          </LocaleLink>
        ) : scan.status === 'processing' ? (
          <span style={{ fontSize: 13, color: 'var(--color-outline)', fontWeight: 500 }}>{dict.home.status.scanning}</span>
        ) : (
          <LocaleLink
            href={`/scans/${scan.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6,
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
              color: 'var(--color-on-surface)', fontSize: 13, fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
            <span>{dict.home.actions.viewDetails}</span>
          </LocaleLink>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════ */
export default function HomeView() {
  const router = useRouter();
  const { locale, dict } = useI18n();
  const [url, setUrl] = useState('https://');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [guestLimitHit, setGuestLimitHit] = useState(false);

  const { user, openAuth } = useAuth();
  const [startScan, { isLoading }] = useStartScanMutation();
  const { data: scans, isLoading: listLoading, refetch: refetchScans } = useListSiteScansQuery();

  useEffect(() => {
    if (!scans?.some((s) => s.status === 'processing')) return;
    const timer = setInterval(() => void refetchScans(), 4000);
    return () => clearInterval(timer);
  }, [scans, refetchScans]);

  const hasScans = Boolean(scans && scans.length > 0);

  const guestUsed =
    !user &&
    Boolean(
      scans?.some(
        (s) => s.status === 'processing' || (s.status === 'completed' && s.successfulPages > 0),
      ),
    );
  const guestBlocked = guestUsed || guestLimitHit;
  const guestScanId = scans?.find((s) => s.successfulPages > 0 || s.status === 'processing')?.id;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = url.trim();
    if (!trimmed || trimmed === 'https://') {
      setErrorMsg(dict.home.errors.invalidUrl);
      return;
    }
    if (guestBlocked) {
      void refetchScans();
      return;
    }
    try {
      const res = await startScan({ url: trimmed }).unwrap();
      router.push(`/${locale}/scans/${res.siteScanId}`);
    } catch (err) {
      console.error('startScan failed:', err);
      const failure = err as {
        status?: string | number;
        data?: { message?: string; code?: string; siteScanId?: string };
      };
      if (failure.status === 403 && failure.data?.code === 'GUEST_SCAN_LIMIT') {
        setGuestLimitHit(true);
        void refetchScans();
      } else if (failure.status === 'FETCH_ERROR') {
        setErrorMsg(dict.home.errors.fetch);
      } else if (failure.status === 400) {
        setErrorMsg(
          failure.data?.code === 'URL_NOT_PUBLIC'
            ? dict.home.errors.notPublic
            : (failure.data?.message ?? dict.home.errors.badRequest),
        );
      } else if (failure.status === 'PARSING_ERROR') {
        setErrorMsg(dict.home.errors.parsing);
      } else {
        setErrorMsg(
          failure.data?.message ?? dict.home.errors.generic(String(failure.status ?? 'unknown')),
        );
      }
    }
  }

  const featureCards = [
    {
      icon: 'speed',
      color: 'var(--color-secondary)',
      ...dict.home.features.standards,
      badgeIcon: undefined as string | undefined,
    },
    {
      icon: 'psychology',
      color: 'var(--color-primary)',
      ...dict.home.features.aiReport,
      badgeIcon: undefined as string | undefined,
    },
    {
      icon: 'forum',
      color: 'var(--color-on-surface-variant)',
      ...dict.home.features.chat,
      badgeIcon: 'menu_book' as string | undefined,
    },
  ];

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes float-dot {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-ping-custom {
          animation: ping 2s cubic-bezier(0,0,0.2,1) infinite;
        }
        .animate-pulse-custom {
          animation: ping 2.5s cubic-bezier(0,0,0.2,1) infinite;
        }
        .hover-scan-row:hover {
          background: color-mix(in srgb, var(--color-surface-container-low) 40%, transparent);
        }
        .hover-underline:hover {
          text-decoration: underline;
        }
        .icon-card-group:hover .icon-card-icon {
          background: var(--color-primary) !important;
          color: var(--color-on-primary) !important;
        }
        .audit-form-wrapper:focus-within {
          border-color: var(--color-primary-container) !important;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 10%, transparent) !important;
        }
        .card-hover:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          border-color: color-mix(in srgb, var(--color-primary) 40%, transparent) !important;
        }
        .btn-login:hover {
          background: var(--color-surface-container-low);
          border-color: var(--color-outline);
        }
        .demo-btn:hover {
          background: var(--color-surface-container-low);
          border-color: var(--color-outline);
        }
        .submit-btn:hover:not(:disabled) {
          background: var(--color-primary) !important;
        }
        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .footer-link:hover {
          color: var(--color-on-surface);
        }
        .tab-btn:hover {
          color: var(--color-on-surface);
        }
        .modal-overlay {
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .modal-card {
          animation: zoomIn 0.15s ease;
        }
        @keyframes zoomIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .dot-grid {
          background-image: radial-gradient(#2563eb 1px, transparent 1px);
          background-size: 24px 24px;
          -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 10%, #000 70%, transparent 100%);
          mask-image: radial-gradient(ellipse 60% 50% at 50% 10%, #000 70%, transparent 100%);
        }
      `}</style>

      {/* ── Header (animated, with scroll progress + active indicator) ── */}
      <Header />

      {/* ── Main ── */}
      <main style={{ width: '100%', paddingTop: 64, backgroundColor: 'var(--color-surface)', minHeight: 'calc(100vh - 140px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>

          {/* ── Hero Section ── */}
          <section id="hero" style={{
            position: 'relative', width: '100%', overflow: 'hidden',
            background: 'linear-gradient(to bottom, color-mix(in srgb, var(--color-surface-container-low) 40%, transparent), var(--color-surface) 60%)',
            paddingBottom: 64, paddingTop: 32,
          }}>
            <div className="dot-grid" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
            }} />

            <div style={{
              position: 'relative', maxWidth: 896, margin: '0 auto',
              padding: '0 32px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '4px 12px', borderRadius: 999,
                backgroundColor: 'var(--color-surface-container)',
                border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
                marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: 'var(--color-primary-container)',
                }} className="animate-ping-custom" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', lineHeight: '16px' }}>
                  {dict.home.badgeEngine}
                </span>
                <span style={{ color: 'var(--color-outline-variant)', fontSize: 12 }}>•</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-on-surface-variant)', lineHeight: '16px' }}>
                  {dict.home.badgeCompatibility}
                </span>
              </div>

              <h1 style={{
                fontWeight: 800, letterSpacing: '-0.03em',
                color: 'var(--color-on-background)',
                marginBottom: 20, maxWidth: 672,
                fontSize: 'clamp(30px, 5vw, 44px)',
                lineHeight: 'clamp(42px, 6vw, 58px)',
              }}>
                {dict.home.title}
              </h1>

              <p style={{
                fontSize: 18, lineHeight: '28px', fontWeight: 400,
                color: 'var(--color-on-surface-variant)',
                maxWidth: 560, marginBottom: 40,
              }}>
                {dict.home.subtitle}
              </p>

              <div
                className="audit-form-wrapper"
                style={{
                  width: '100%', maxWidth: 640,
                  backgroundColor: 'var(--color-surface-container-lowest)',
                  borderRadius: 12, padding: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              >
                <form
                  onSubmit={onSubmit}
                  style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}
                >
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span className="material-symbols-outlined" style={{
                      position: 'absolute', insetInlineStart: 12, fontSize: 20,
                      color: 'var(--color-outline)', pointerEvents: 'none',
                    }}>link</span>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      placeholder="https://example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      style={{
                        width: '100%', height: 48,
                        paddingInlineStart: 40, paddingInlineEnd: 16,
                        background: 'transparent',
                        fontFamily: 'var(--font-jetbrains), monospace',
                        fontSize: 12, fontWeight: 500,
                        color: 'var(--color-on-surface)',
                        border: 'none', outline: 'none',
                        letterSpacing: '0.02em',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || guestBlocked}
                    className="submit-btn"
                    style={{
                      height: 48, padding: '0 24px', borderRadius: 8,
                      backgroundColor: 'var(--color-primary-container)',
                      color: 'var(--color-on-primary)',
                      fontSize: 16, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'background-color 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    {isLoading ? (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                        <span>{dict.home.startingAudit}</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span>
                        <span>{dict.home.startAudit}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {errorMsg && (
                <p style={{
                  marginTop: 12, fontSize: 13, color: 'var(--color-error)',
                  fontWeight: 500,
                }}>
                  {errorMsg}
                </p>
              )}

              {guestBlocked && (
                <div
                  role="status"
                  style={{
                    marginTop: 16, width: '100%', maxWidth: 640,
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '14px 16px', borderRadius: 12, textAlign: 'start',
                    backgroundColor: '#fffbeb', border: '1px solid #fde68a',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#b45309' }}>lock</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                        {dict.home.guestLimit.title}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: '20px', color: '#92400e' }}>
                        {dict.home.guestLimit.body}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => openAuth('signup')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        height: 34, padding: '0 14px', borderRadius: 8,
                        backgroundColor: 'var(--color-primary-container)',
                        color: 'var(--color-on-primary)', border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                      {dict.home.guestLimit.cta}
                    </button>
                    {guestScanId && (
                      <LocaleLink
                        href={`/scans/${guestScanId}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 12, fontWeight: 600, color: '#92400e', textDecoration: 'none',
                        }}
                        className="hover-underline"
                      >
                        {dict.home.guestLimit.view}
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_back</span>
                      </LocaleLink>
                    )}
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 16, display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', justifyContent: 'center', gap: '8px 24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-on-surface)', fontWeight: 500 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-secondary)' }}>verified</span>
                  <span>{dict.home.freeAudit}</span>
                </div>
                <span style={{ color: 'var(--color-outline-variant)', fontSize: 12 }}>•</span>
                <button
                  onClick={() => setDemoOpen(true)}
                  className="demo-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: 6,
                    backgroundColor: 'var(--color-surface-container-lowest)',
                    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 80%, transparent)',
                    color: 'var(--color-on-surface)',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>visibility</span>
                  <span>{dict.home.viewDemo}</span>
                </button>
              </div>
            </div>
          </section>

          {/* ── Features Section ── */}
          <section id="features" style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 32px', width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {featureCards.map((card, i) => (
                <div
                  key={i}
                  className="card-hover icon-card-group"
                  style={{
                    backgroundColor: 'var(--color-surface-container-lowest)',
                    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
                    borderRadius: 12, padding: 24,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>
                    <div
                      className="icon-card-icon"
                      style={{
                        width: 48, height: 48, borderRadius: 8,
                        backgroundColor: 'var(--color-surface-container)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-primary)',
                        marginBottom: 20,
                        transition: 'background-color 0.2s, color 0.2s',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 26 }}>{card.icon}</span>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: 8 }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize: 14, lineHeight: '24px', color: 'var(--color-on-surface-variant)' }}>
                      {card.description}
                    </p>
                  </div>
                  <div style={{
                    marginTop: 24, paddingTop: 16,
                    borderTop: '1px solid color-mix(in srgb, var(--color-outline-variant) 30%, transparent)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {card.badgeIcon && (
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-outline)' }}>{card.badgeIcon}</span>
                    )}
                    {!card.badgeIcon && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: card.color, display: 'inline-block' }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: card.color, lineHeight: '16px' }}>
                      {card.badge}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Audits Table Section ── */}
          <section id="audits" style={{ maxWidth: 1152, margin: '0 auto', padding: '24px 32px 80px', width: '100%' }}>
            <div style={{
              backgroundColor: 'var(--color-surface-container-lowest)',
              border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                backgroundColor: 'color-mix(in srgb, var(--color-surface-container-low) 30%, transparent)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    padding: 8, borderRadius: 8,
                    backgroundColor: 'color-mix(in srgb, var(--color-primary-fixed) 40%, transparent)',
                    color: 'var(--color-primary)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, display: 'block' }}>history</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1 }}>
                      {dict.home.audits.title}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: '4px 0 0' }}>
                      {dict.home.audits.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              {!user && guestUsed && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '14px 24px', textAlign: 'start',
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
                  borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-primary)' }}>bookmark_added</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                        {dict.home.guestBanner.title}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: '20px', color: 'var(--color-on-surface-variant)' }}>
                        {dict.home.guestBanner.body}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAuth('signup')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 34, padding: '0 14px', borderRadius: 8,
                      backgroundColor: 'var(--color-primary-container)', color: 'var(--color-on-primary)',
                      border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                    {dict.home.guestBanner.cta}
                  </button>
                </div>
              )}

              {listLoading ? (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <svg style={{ animation: 'spin 1s linear infinite', width: 24, height: 24, margin: '0 auto', color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor" />
                  </svg>
                  <p style={{ marginTop: 12, fontSize: 14, color: 'var(--color-on-surface-variant)' }}>{dict.common.loading}</p>
                </div>
              ) : hasScans ? (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'start', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-surface-container-low) 70%, transparent)',
                        borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
                      }}>
                        {dict.home.audits.headers.map((h, i) => (
                          <th key={i} style={{
                            padding: '14px 24px',
                            fontSize: 12, fontWeight: 600, color: 'var(--color-on-surface-variant)',
                            textAlign: i === 4 ? 'center' : 'start',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scans!.map((s) => (
                        <ScanRow key={s.id} scan={s} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  padding: '64px 24px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    backgroundColor: 'var(--color-surface-container-low)',
                    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-outline)', marginBottom: 16,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32 }}>manage_search</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: 4 }}>
                    {dict.home.audits.emptyTitle}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--color-on-surface-variant)', maxWidth: 320, marginBottom: 24, lineHeight: '24px' }}>
                    {dict.home.audits.emptyDescription}
                  </p>
                  <button
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      setTimeout(() => {
                        const el = document.querySelector<HTMLInputElement>('input[type="text"]');
                        el?.focus();
                      }, 300);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '10px 20px', borderRadius: 8,
                      backgroundColor: 'var(--color-primary-container)',
                      color: 'var(--color-on-primary)',
                      fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'background-color 0.15s',
                    }}
                    className="submit-btn"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_link</span>
                    <span>{dict.home.audits.emptyCta}</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        width: '100%',
        backgroundColor: 'var(--color-surface-container-low)',
        borderTop: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
        padding: '24px 0',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)' }}>{dict.common.brand}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--color-primary)',
                backgroundColor: 'var(--color-surface-container)',
                padding: '1px 4px', borderRadius: 4,
              }}>AI</span>
            </div>
            <span style={{ color: 'var(--color-outline-variant)', fontSize: 14 }}>•</span>
            <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: 0 }}>
              {dict.home.footer.rights}
            </p>
          </div>
          <nav style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            {dict.home.footer.links.map((link, i) => (
              <a
                key={i}
                href="#"
                className="footer-link"
                style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', textDecoration: 'none', transition: 'color 0.15s' }}
              >
                {link}
              </a>
            ))}
          </nav>
        </div>
      </footer>

      {/* ── Demo Modal ── */}
      {demoOpen && (
        <div
          className="modal-overlay"
          onClick={() => setDemoOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: 'rgba(41,48,64,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--color-surface-container-lowest)',
              border: '1px solid color-mix(in srgb, var(--color-outline-variant) 60%, transparent)',
              borderRadius: 12, maxWidth: 480, width: '100%',
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              textAlign: 'start',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingBottom: 16,
              borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-secondary)', display: 'inline-block' }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-on-surface)' }}>{dict.home.demo.title}</span>
              </div>
              <button
                onClick={() => setDemoOpen(false)}
                aria-label={dict.common.close}
                style={{
                  padding: 4, background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-on-surface-variant)', borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'var(--color-surface-container-low)',
                padding: 12, borderRadius: 8,
              }}>
                <span style={{
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontSize: 12, fontWeight: 700, color: 'var(--color-primary)',
                  direction: 'ltr',
                }}>
                  https://store-demo.sa
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '2px 10px', borderRadius: 999,
                  backgroundColor: 'var(--color-secondary-fixed)',
                  color: 'var(--color-on-secondary-fixed)',
                }}>
                  89 / 100
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', fontWeight: 500, margin: 0 }}>
                  {dict.home.demo.recommendations}
                </p>
                <div style={{
                  padding: 10, borderRadius: 6,
                  backgroundColor: 'color-mix(in srgb, var(--color-surface-container) 60%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-outline-variant) 30%, transparent)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-secondary)', marginTop: 2 }}>check_circle</span>
                  <span style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>
                    {dict.home.demo.items[0]}
                  </span>
                </div>
                <div style={{
                  padding: 10, borderRadius: 6,
                  backgroundColor: 'rgba(255,251,235,0.6)',
                  border: '1px solid #fde68a',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#d97706', marginTop: 2 }}>warning</span>
                  <span style={{ fontSize: 13, color: '#92400e' }}>
                    {dict.home.demo.items[1]}
                  </span>
                </div>
              </div>
            </div>

            <div style={{
              paddingTop: 12,
              borderTop: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setDemoOpen(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-surface-container)',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, color: 'var(--color-on-surface)', fontWeight: 500,
                  transition: 'background-color 0.15s',
                }}
              >
                {dict.home.demo.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
