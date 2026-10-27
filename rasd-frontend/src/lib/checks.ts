import type { CheckResult, CheckStatus } from '@/types';

// أي check مش هنا هيظهر باسمه التقني
const CHECK_LABELS: Record<string, string> = {
  title_tag: 'عنوان الصفحة (Title)',
  meta_description: 'وصف الصفحة (Meta Description)',
  h1_tag: 'عنوان H1',
  heading_structure: 'هيكل العناوين',
  image_alt_tags: 'النص البديل للصور',
  canonical_tag: 'الرابط الأساسي (Canonical)',
  open_graph_tags: 'وسوم Open Graph',
  core_web_vitals: 'Core Web Vitals',
  structured_data: 'البيانات المنظمة',
  hreflang: 'وسوم hreflang',
  meta_robots: 'Meta Robots',
  robots_txt_content: 'ملف robots.txt',
  sitemap_content: 'خريطة الموقع (Sitemap)',
  security_headers: 'ترويسات الأمان',
  keyword_stuffing: 'حشو الكلمات المفتاحية',
  broken_internal_links: 'الروابط الداخلية المكسورة',
};

export const labelFor = (check: string) => CHECK_LABELS[check] ?? check;

export const STATUS_META: Record<
  CheckStatus,
  { label: string; badge: string; color: string; order: number }
> = {
  fail: { label: 'فاشل', badge: 'bg-red-100 text-red-700', color: '#dc2626', order: 0 },
  warning: { label: 'تحذير', badge: 'bg-amber-100 text-amber-700', color: '#f59e0b', order: 1 },
  unknown: { label: 'لم يُقس', badge: 'bg-gray-100 text-gray-600', color: '#9ca3af', order: 2 },
  pass: { label: 'ناجح', badge: 'bg-green-100 text-green-700', color: '#16a34a', order: 3 },
};

export function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export function countStatuses(results: CheckResult[]) {
  const counts: Record<CheckStatus, number> = { pass: 0, warning: 0, fail: 0, unknown: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

// المشاكل الأول، وبعدها الأعلى وزناً
export function sortChecks(results: CheckResult[]) {
  return [...results].sort(
    (a, b) =>
      STATUS_META[a.status].order - STATUS_META[b.status].order ||
      (b.weight ?? 0) - (a.weight ?? 0),
  );
}

export const SEVERITY_META = {
  critical: { label: 'حرجة', badge: 'bg-red-100 text-red-700', border: 'border-red-300' },
  moderate: { label: 'متوسطة', badge: 'bg-amber-100 text-amber-700', border: 'border-amber-300' },
  minor: { label: 'بسيطة', badge: 'bg-blue-100 text-blue-700', border: 'border-blue-300' },
} as const;