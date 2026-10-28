'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useGenerateReportMutation, useGetReportQuery } from '@/store/api';
import { labelFor } from '@/lib/checks';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateMedium } from '@/i18n/format';
import type { SeoReport } from '@/types';

type Severity = 'critical' | 'moderate' | 'minor';
type Issue = SeoReport['priorityIssues'][number];

const CARD: CSSProperties = {
  backgroundColor: 'var(--color-surface-container-lowest)',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.03)',
};

const MONO: CSSProperties = {
  fontFamily: 'var(--font-jetbrains), monospace',
};

const SEVERITY_TONES: Record<Severity, { bg: string; color: string; dot: string }> = {
  critical: {
    bg: 'var(--color-error-container)',
    color: 'var(--color-on-error-container)',
    dot: 'var(--color-error)',
  },
  moderate: {
    bg: 'var(--color-surface-container-high)',
    color: 'var(--color-tertiary)',
    dot: 'var(--color-tertiary)',
  },
  minor: {
    bg: 'var(--color-primary-fixed)',
    color: 'var(--color-on-primary-fixed)',
    dot: 'var(--color-primary)',
  },
};

function ScoreBadge({ score }: { score: number | null }) {
  const tone =
    score == null
      ? { bg: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }
      : score >= 80
        ? { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' }
        : score >= 60
          ? { bg: '#fef3c7', color: '#92400e' }
          : { bg: 'var(--color-error-container)', color: 'var(--color-on-error-container)' };

  return (
    <span
      dir="ltr"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 42,
        height: 42,
        padding: '0 10px',
        borderRadius: 10,
        backgroundColor: tone.bg,
        color: tone.color,
        fontSize: 19,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {score ?? '—'}
    </span>
  );
}

function IssueCard({ issue, rank }: { issue: Issue; rank: number }) {
  const { dict } = useI18n();
  const copy = dict.report;
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);

  const tone = SEVERITY_TONES[issue.severity];
  const pages = issue.affectedPages ?? [];
  const unmeasured = issue.unmeasured ?? [];
  const visiblePages = showAllPages ? pages : pages.slice(0, 5);
  const hasEvidence = Boolean(issue.evidence) || pages.length > 0 || unmeasured.length > 0;

  return (
    <div style={{ ...CARD, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              backgroundColor: tone.bg,
              color: tone.color,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: tone.dot }}
            />
            {dict.checks.severity[issue.severity]}
          </span>
          <span style={{ color: 'var(--color-outline-variant)' }}>•</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: tone.dot }}>
            {issue.scope === 'site'
              ? copy.siteWide
              : copy.pages(issue.affectedPagesCount)}
          </span>
          <span style={{ color: 'var(--color-outline-variant)' }}>•</span>
          <span dir="ltr" style={{ ...MONO, fontSize: 11, color: 'var(--color-outline)' }}>
            {issue.check}
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-outline)' }}>
          {copy.priority(rank)}
        </span>
      </div>

      <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.6 }}>
        {labelFor(dict, issue.check)}
      </h4>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9 }}>{issue.explanation}</p>

      <div
        style={{
          padding: 14,
          borderRadius: 8,
          backgroundColor: 'var(--color-surface-container-low)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
            tips_and_updates
          </span>
          {copy.solution}
        </span>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.9 }}>{issue.recommendation}</p>
      </div>

      {hasEvidence && (
        <div>
          <button
            type="button"
            className="report-collapse-btn"
            aria-expanded={evidenceOpen}
            onClick={() => setEvidenceOpen((open) => !open)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: 'var(--color-primary)' }}
              >
                troubleshoot
              </span>
              <span>{copy.evidenceTitle}</span>
            </span>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 20,
                color: 'var(--color-outline)',
                transform: evidenceOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              expand_more
            </span>
          </button>

          {evidenceOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              {unmeasured.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {unmeasured.map((item) => (
                    <span
                      key={item.metric}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 6,
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {copy.unmeasured(item.metric, item.pages)}
                    </span>
                  ))}
                </div>
              )}

              {issue.evidence && (
                <p
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--color-surface-container-low)',
                    fontSize: 12,
                    lineHeight: 1.9,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {issue.evidence}
                </p>
              )}

              {pages.length > 0 && (
                <div
                  dir="ltr"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: 'var(--color-surface-container-lowest)',
                    boxShadow: 'inset 0 0 0 1px var(--color-surface-container)',
                    overflowX: 'auto',
                  }}
                >
                  {visiblePages.map((pageUrl) => (
                    <span
                      key={pageUrl}
                      style={{
                        ...MONO,
                        fontSize: 11,
                        color: 'var(--color-on-surface)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                      }}
                    >
                      {pageUrl}
                    </span>
                  ))}
                </div>
              )}

              {pages.length > 5 && (
                <button
                  type="button"
                  className="report-ghost-btn"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowAllPages((show) => !show)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {showAllPages ? 'expand_less' : 'open_in_full'}
                  </span>
                  {showAllPages ? copy.hidePages : copy.showAllPages(pages.length - 5)}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportSection({
  siteScanId,
  rescanAt,
  averageScore,
  pageCount,
  createdAt,
}: {
  siteScanId: string;
  /** وقت آخر إعادة فحص بعد التقرير — بيخلي التنبيه يظهر. */
  rescanAt?: string | null;
  averageScore?: number | null;
  pageCount?: number;
  createdAt?: string;
}) {
  const { locale, dict } = useI18n();
  const copy = dict.report;
  const [generate, { isLoading: starting, error: startError }] = useGenerateReportMutation();
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  const { data, refetch } = useGetReportQuery({ id: siteScanId, lang: locale });
  const reportStatus = data?.reportStatus ?? null;
  const report = data?.aiReport ?? null;

  useEffect(() => {
    if (reportStatus !== 'processing') return;
    const timer = setInterval(() => void refetch(), 2500);
    return () => clearInterval(timer);
  }, [reportStatus, refetch]);

  const onGenerate = () => {
    void generate({ id: siteScanId, lang: locale }).unwrap().catch(() => undefined);
  };

  const issues = useMemo(() => report?.priorityIssues ?? [], [report]);
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, moderate: 0, minor: 0 };
    for (const issue of issues) counts[issue.severity] += 1;
    return counts;
  }, [issues]);
  const visibleIssues = useMemo(
    () => (severityFilter === 'all' ? issues : issues.filter((i) => i.severity === severityFilter)),
    [issues, severityFilter],
  );

  const reportScore = averageScore != null ? Math.round(averageScore) : null;
  const pages = pageCount ?? 1;

  const headerAction =
    reportStatus === 'processing' ? (
      <button type="button" className="report-primary-btn" disabled>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}
        >
          progress_activity
        </span>
        {copy.generatingShort}
      </button>
    ) : reportStatus === 'completed' ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          backgroundColor: 'color-mix(in srgb, var(--color-secondary-fixed) 35%, transparent)',
          color: 'var(--color-secondary)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          check
        </span>
        {copy.done}
      </span>
    ) : reportStatus === 'failed' ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          backgroundColor: 'var(--color-error-container)',
          color: 'var(--color-on-error-container)',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          error_outline
        </span>
        {copy.failedTitle}
      </span>
    ) : (
      <button type="button" className="report-primary-btn" onClick={onGenerate} disabled={starting}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 18,
            ...(starting ? { animation: 'spin 1s linear infinite' } : {}),
          }}
        >
          {starting ? 'progress_activity' : 'magic_button'}
        </span>
        {starting ? copy.generatingShort : reportStatus === 'failed' ? copy.retry : copy.generate}
      </button>
    );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        .report-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          background-color: var(--color-primary-container);
          color: var(--color-on-primary);
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
          transition: background-color 0.15s;
        }
        .report-primary-btn:hover:not(:disabled) { background-color: var(--color-primary); }
        .report-primary-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .report-ghost-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          background-color: var(--color-surface-container);
          color: var(--color-on-surface);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          transition: background-color 0.15s;
        }
        .report-ghost-btn:hover { background-color: var(--color-surface-variant); }
        .report-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          background-color: var(--color-surface-container-low);
          color: var(--color-on-surface);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          transition: background-color 0.15s;
        }
        .report-collapse-btn:hover { background-color: var(--color-surface-container); }
        .report-filter-chip {
          padding: 4px 12px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          transition: background-color 0.15s, filter 0.15s;
        }
        .report-filter-chip:hover { filter: brightness(0.97); }
        .report-progress {
          animation: report-progress-rtl 1.6s ease-in-out infinite;
        }
        @keyframes report-progress-rtl {
          0% { transform: translateX(150%); }
          100% { transform: translateX(-250%); }
        }
        html[dir='ltr'] .report-progress { animation-name: report-progress-ltr; }
        @keyframes report-progress-ltr {
          0% { transform: translateX(-250%); }
          100% { transform: translateX(150%); }
        }
      `}</style>

      {/* ── Section header ── */}
      <div style={{ ...CARD, padding: 20 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: 'var(--color-primary-fixed)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 24, fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
                  {copy.title}
                </h2>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: 'var(--color-primary-fixed)',
                    color: 'var(--color-on-primary-fixed)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                  {copy.insights}
                </span>
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 14,
                  lineHeight: 1.8,
                  maxWidth: 640,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                {copy.subtitle}
              </p>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>{headerAction}</div>
        </div>
      </div>

      {startError && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error)' }}>{copy.startError}</p>
      )}

      {/* ── Not generated ── */}
      {reportStatus !== 'processing' && reportStatus !== 'failed' && !report && (
        <div
          style={{
            ...CARD,
            padding: '40px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}
            >
              smart_toy
            </span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{copy.emptyTitle}</h3>
            <p
              style={{
                margin: '8px auto 0',
                maxWidth: 560,
                fontSize: 14,
                lineHeight: 1.9,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {copy.emptyBody}
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              width: '100%',
              maxWidth: 720,
              textAlign: 'start',
            }}
          >
            {[
              {
                icon: 'sort',
                color: 'var(--color-primary)',
                ...copy.emptyFeatures.priorities,
              },
              {
                icon: 'build',
                color: 'var(--color-secondary)',
                ...copy.emptyFeatures.fixes,
              },
              {
                icon: 'verified',
                color: 'var(--color-tertiary)',
                ...copy.emptyFeatures.honest,
              },
            ].map((feature) => (
              <div
                key={feature.title}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: 'var(--color-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: feature.color }}
                >
                  {feature.icon}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{feature.title}</span>
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {feature.description}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="report-primary-btn"
            onClick={onGenerate}
            disabled={starting}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 18,
                fontVariationSettings: "'FILL' 1",
                ...(starting ? { animation: 'spin 1s linear infinite' } : {}),
              }}
            >
              {starting ? 'progress_activity' : 'auto_awesome'}
            </span>
            {starting ? copy.generatingShort : copy.generateCta}
          </button>
        </div>
      )}

      {/* ── Generating ── */}
      {reportStatus === 'processing' && (
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor:
                'color-mix(in srgb, var(--color-surface-container-high) 60%, transparent)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 30,
                  color: 'var(--color-primary-container)',
                  animation: 'spin 1.2s linear infinite',
                  flexShrink: 0,
                }}
              >
                progress_activity
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{copy.generatingTitle}</p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 13,
                    lineHeight: 1.8,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {copy.generatingSubtitle(pages)}
                </p>
              </div>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: 'var(--color-surface-container-lowest)',
                color: 'var(--color-on-surface-variant)',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              <span
                className="animate-ping-slow"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary-container)',
                }}
              />
              {copy.autoRefresh}
            </span>
          </div>

          <div
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: 'var(--color-surface-container)',
              overflow: 'hidden',
            }}
          >
            <div
              className="report-progress"
              style={{
                width: '40%',
                height: '100%',
                borderRadius: 999,
                backgroundColor: 'var(--color-primary-container)',
              }}
            />
          </div>

          <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                height: 96,
                borderRadius: 12,
                backgroundColor: 'var(--color-surface-container-low)',
              }}
            />
            <div
              style={{
                height: 88,
                borderRadius: 12,
                backgroundColor: 'var(--color-surface-container-low)',
              }}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  height: 64,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-container-low)',
                }}
              />
              <div
                style={{
                  height: 64,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-container-low)',
                }}
              />
              <div
                style={{
                  height: 64,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-container-low)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Failed ── */}
      {reportStatus === 'failed' && (
        <div
          style={{
            borderRadius: 12,
            padding: 24,
            backgroundColor: 'color-mix(in srgb, var(--color-error-container) 40%, transparent)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: 'var(--color-error-container)',
              color: 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
              error_outline
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--color-on-error-container)',
              }}
            >
              {copy.failedTitle}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.9,
                color: 'var(--color-on-error-container)',
              }}
            >
              {copy.failedBody}
            </p>
            <button
              type="button"
              className="report-primary-btn"
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
              onClick={onGenerate}
              disabled={starting}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  ...(starting ? { animation: 'spin 1s linear infinite' } : {}),
                }}
              >
                {starting ? 'progress_activity' : 'refresh'}
              </span>
              {starting ? copy.generatingShort : copy.retryCta}
            </button>
          </div>
        </div>
      )}

      {/* ── Completed ── */}
      {reportStatus === 'completed' && report && (
        <>
          <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: 'var(--color-primary-fixed)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
                  >
                    insights
                  </span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{copy.summaryTitle}</h3>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 13,
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {copy.summarySubtitle(pages)}
                  </p>
                </div>
              </div>
              <span dir="ltr" style={{ ...MONO, fontSize: 11, color: 'var(--color-outline)' }}>
                ID: {siteScanId.slice(0, 8).toUpperCase()}
              </span>
            </div>

            {rescanAt && (
              <p
                style={{
                  margin: 0,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid #fde68a',
                  backgroundColor: '#fffbeb',
                  color: '#92400e',
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
              >
                {copy.rescanNotice(formatDateMedium(locale, rescanAt))}
              </p>
            )}

            <p
              style={{
                margin: 0,
                padding: 16,
                borderRadius: 12,
                backgroundColor: 'var(--color-surface-container-low)',
                fontSize: 15,
                lineHeight: 1.95,
              }}
            >
              {report.executiveSummary}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ScoreBadge score={reportScore} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {copy.overallScore}{' '}
                <span dir="ltr" style={MONO}>
                  {reportScore ?? '—'}/100
                </span>
              </span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.9,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {report.overallScoreComment}
            </p>
          </div>

          {report.quickWins.length > 0 && (
            <div
              style={{
                borderRadius: 12,
                padding: 20,
                backgroundColor:
                  'color-mix(in srgb, var(--color-secondary-fixed) 28%, transparent)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: 'var(--color-secondary-container)',
                      color: 'var(--color-on-secondary-container)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 19, fontVariationSettings: "'FILL' 1" }}
                    >
                      bolt
                    </span>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{copy.quickWins}</h3>
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: 12,
                        color: 'var(--color-on-secondary-fixed-variant)',
                      }}
                    >
                      {copy.quickWinsHint}
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 999,
                    backgroundColor: 'var(--color-secondary)',
                    color: 'var(--color-on-secondary)',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                    rocket_launch
                  </span>
                  {copy.quickWinsCount(report.quickWins.length)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {report.quickWins.map((win, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor:
                        'color-mix(in srgb, var(--color-surface-container-lowest) 85%, transparent)',
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-secondary-container)',
                        color: 'var(--color-on-secondary-container)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        check
                      </span>
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.9 }}>{win}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{copy.issues}</h3>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      backgroundColor: 'var(--color-surface-container)',
                      color: 'var(--color-on-surface-variant)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {copy.issuesCount(issues.length)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    className="report-filter-chip"
                    onClick={() => setSeverityFilter('all')}
                    style={{
                      backgroundColor:
                        severityFilter === 'all'
                          ? 'var(--color-primary-fixed)'
                          : 'var(--color-surface-container)',
                      color:
                        severityFilter === 'all'
                          ? 'var(--color-on-primary-fixed)'
                          : 'var(--color-on-surface-variant)',
                    }}
                  >
                    {copy.filterAll} ({issues.length})
                  </button>
                  {(Object.keys(severityCounts) as Severity[])
                    .filter((severity) => severityCounts[severity] > 0)
                    .map((severity) => {
                      const tone = SEVERITY_TONES[severity];
                      const active = severityFilter === severity;
                      return (
                        <button
                          key={severity}
                          type="button"
                          className="report-filter-chip"
                          onClick={() => setSeverityFilter(severity)}
                          style={{
                            backgroundColor: active
                              ? tone.bg
                              : 'var(--color-surface-container)',
                            color: active ? tone.color : 'var(--color-on-surface-variant)',
                          }}
                        >
                          {dict.checks.severity[severity]} ({severityCounts[severity]})
                        </button>
                      );
                    })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleIssues.map((issue, index) => (
                  <IssueCard
                    key={`${issue.check}-${index}`}
                    issue={issue}
                    rank={issues.indexOf(issue) + 1}
                  />
                ))}
              </div>
            </div>
          )}

          {report.strengths.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{copy.strengths}</h3>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 999,
                    backgroundColor: 'var(--color-secondary-container)',
                    color: 'var(--color-on-secondary-container)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {copy.strengthsCount(report.strengths.length)}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {report.strengths.map((strength, index) => (
                  <div
                    key={`${strength.title}-${index}`}
                    style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-secondary-container)',
                          color: 'var(--color-on-secondary-container)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                          check
                        </span>
                      </span>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.6 }}>
                        {strength.title}
                      </h4>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        lineHeight: 1.9,
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      {strength.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0 4px',
              fontSize: 12,
              color: 'var(--color-outline)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: 'var(--color-secondary)' }}
              >
                verified
              </span>
              {createdAt ? copy.sourceNote(formatDateMedium(locale, createdAt)) : copy.sourceNoDate}
            </span>
            <span dir="ltr" style={{ ...MONO, fontSize: 11 }}>
              {copy.poweredBy}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
