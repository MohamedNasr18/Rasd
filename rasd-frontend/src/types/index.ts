export type ScanStatus = 'processing' | 'completed' | 'failed';
export type ReportStatus = 'processing' | 'completed' | 'failed' | null;

export interface SeoReport {
  executiveSummary: string;
  overallScoreComment: string;
  strengths: { check?: string; title: string; explanation: string }[];
  priorityIssues: {
    check: string;
    severity: 'critical' | 'moderate' | 'minor';
    affectedPagesCount: number;
    explanation: string;
    recommendation: string;
    /** الأدلة المقاسة اللي الشرح مبني عليها (بتتحسب في الباك اند). */
    evidence?: string;
    affectedPages?: string[];
    scope?: 'page' | 'site';
    /** مقاييس الفحص اللي ما قدرش يقيسها. */
    unmeasured?: { metric: string; pages: number }[];
  }[];
  quickWins: string[];
}

export interface Scan {
  id: string;
  siteId: string;
  siteScanId: string | null;
  url: string;
  score: number;
  results: CheckResult[];
  triggeredBy: 'scan' | 'agent_rescan';
  previousScanId: string | null;
  /** نسخة المحلل اللي أنتجت الفحص — المقارنة بتتعرض بس لو النسختين متطابقتين. */
  analyzerVersion?: string | null;
  createdAt: string;
}

export type PageStage =
  | 'queued'
  | 'rendering'
  | 'analyzing'
  | 'speed'
  | 'links'
  | 'saving'
  | 'done'
  | 'failed';

export interface PageProgress {
  id: string;
  kind: 'page' | 'site';
  position: number;
  url: string;
  stage: PageStage;
  score: number | null;
  updatedAt: string;
}

export interface SiteScanDetail {
  id: string;
  siteId: string;
  status: ScanStatus;
  averageScore: number | null;
  pageCount: number;
  completedPages: number;
  siteLevelResults: CheckResult[] | null;
  aiReport: SeoReport | null;
  reportStatus: ReportStatus;
  createdAt: string;
  scans: Scan[];
  progress?: PageProgress[];
}

export interface SiteScanListItem {
  id: string;
  status: ScanStatus;
  averageScore: number | null;
  pageCount: number;
  completedPages: number;
  reportStatus: ReportStatus;
  createdAt: string;
  site: { id: string; url: string };
}

export interface StartScanResponse {
  siteScanId: string;
  flowJobId?: string;
  pagesQueued: number;
}

export interface ScorePoint {
  siteScanId: string;
  createdAt: string;
  averageScore: number;
  pageCount: number;
}

export interface ScoreHistory {
  url: string;
  points: ScorePoint[];
}

export interface ReportResponse {
  reportStatus: ReportStatus;
  aiReport: SeoReport | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatReply {
  conversationId: string;
  reply: string;
}

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'unknown';

export interface CheckResult {
  check: string;
  status: CheckStatus;
  weight?: number;
  message: string;
  details?: unknown;
}
