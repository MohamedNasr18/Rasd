'use client';
import { useGenerateReportMutation, useGetReportQuery } from '@/store/api';
import { SEVERITY_META, labelFor } from '@/lib/checks';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function ReportSection({
  siteScanId,
  rescanAt,
}: {
  siteScanId: string;
  /** وقت آخر إعادة فحص بعد التقرير — بيخلي التنبيه يظهر. */
  rescanAt?: string | null;
}) {
  const [generate, { isLoading: starting, error: startError }] = useGenerateReportMutation();

  // الـ polling شغال طول ما التقرير processing، ويقف لوحده بعدها
  const { data } = useGetReportQuery(siteScanId, {
    pollingInterval: 0,
    skip: false,
  });
  const status = data?.reportStatus ?? null;
  const { data: polled } = useGetReportQuery(siteScanId, {
    pollingInterval: status === 'processing' ? 2500 : 0,
  });

  const report = polled?.aiReport ?? data?.aiReport ?? null;
  const reportStatus = polled?.reportStatus ?? status;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">التقرير بالذكاء الاصطناعي</h2>
        {(reportStatus === null || reportStatus === 'failed') && (
          <button
            onClick={() => generate(siteScanId)}
            disabled={starting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {reportStatus === 'failed' ? 'جرب تاني' : 'ولّد التقرير'}
          </button>
        )}
      </div>

      {startError && (
        <p className="mb-3 text-sm text-red-600">مقدرتش أبدأ توليد التقرير، جرب تاني.</p>
      )}

      {reportStatus === 'failed' && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">توليد التقرير فشل.</p>
      )}

      {reportStatus === 'processing' && (
        <div className="rounded-lg border bg-white p-6 text-gray-600">
          جاري كتابة التقرير... ممكن ياخد دقيقة.
        </div>
      )}

      {reportStatus === 'completed' && report && (
        <div className="space-y-6">
          {rescanAt && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              التقرير ده مبني على الفحص الأصلي. آخر إعادة فحص كانت {formatDate(rescanAt)}،
              فالأرقام اللي فوق ممكن تكون أحدث من اللي التقرير بيوصفه.
            </p>
          )}

          <div className="rounded-lg border bg-white p-6">
            <h3 className="mb-2 font-semibold">الملخص</h3>
            <p className="leading-relaxed">{report.executiveSummary}</p>
            <p className="mt-3 text-sm text-gray-500">{report.overallScoreComment}</p>
          </div>

          {report.quickWins.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <h3 className="mb-2 font-semibold text-green-800">إصلاحات سريعة</h3>
              <ul className="list-inside list-disc space-y-1">
                {report.quickWins.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-3 font-semibold">المشاكل حسب الأولوية</h3>
            <div className="space-y-3">
              {report.priorityIssues.map((issue, i) => {
                const sev = SEVERITY_META[issue.severity];
                return (
                  <div key={i} className={`rounded-lg border bg-white p-5 ${sev.border}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-medium">{labelFor(issue.check)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sev.badge}`}>
                        {sev.label} ·{' '}
                        {issue.scope === 'site'
                          ? 'الموقع بالكامل'
                          : `${issue.affectedPagesCount} صفحة`}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{issue.explanation}</p>
                    {issue.evidence && (
                      <p dir="auto" className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
                        <span className="font-medium">الدليل: </span>
                        {issue.evidence}
                      </p>
                    )}
                    {issue.affectedPages && issue.affectedPages.length > 0 && (
                      <p dir="ltr" className="mt-2 truncate text-left text-xs text-gray-500">
                        {issue.affectedPages.slice(0, 5).join(' · ')}
                        {issue.affectedPages.length > 5
                          ? ` +${issue.affectedPages.length - 5}`
                          : ''}
                      </p>
                    )}
                    <p className="mt-3 rounded bg-gray-50 p-3 text-sm">
                      <span className="font-medium">الحل: </span>
                      {issue.recommendation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {report.strengths.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold">نقاط القوة</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {report.strengths.map((s, i) => (
                  <li key={i} className="rounded-lg border bg-white p-4">
                    <p className="font-medium">{s.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{s.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}