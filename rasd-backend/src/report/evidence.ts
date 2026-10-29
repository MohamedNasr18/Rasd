import type { Language } from '../common/language.js';

export interface EvidenceInput {
  failCount: number;
  warningCount: number;
  unknownCount: number;
  passCount: number;
  messageCounts: Record<string, number>;
  unmeasured: Record<string, number>;
}

const MAX_SAMPLES = 2;
const TITLE_LENGTH = /^Title length is (\d+) chars\./;
const META_LENGTH = /^Meta description is (\d+) chars\./;

export function arabicPages(count: number): string {
  if (count === 1) return 'صفحة واحدة';
  if (count === 2) return 'صفحتين';
  if (count <= 10) return `${count} صفحات`;
  return `${count} صفحة`;
}

function statusCounts(failCount: number, warningCount: number): string {
  const parts: string[] = [];

  if (failCount === 1) parts.push('فشل واحد');
  else if (failCount === 2) parts.push('فشلان');
  else if (failCount > 2) {
    parts.push(failCount <= 10 ? `${failCount} حالات فشل` : `${failCount} حالة فشل`);
  }

  if (warningCount === 1) parts.push('تحذير واحد');
  else if (warningCount === 2) parts.push('تحذيران');
  else if (warningCount > 2) {
    parts.push(warningCount <= 10 ? `${warningCount} تحذيرات` : `${warningCount} تحذيرًا`);
  }

  return parts.join(' و') || 'بدون مشاكل';
}

function lengthLine(
  label: string,
  ideal: string,
  values: { value: number; pages: number }[],
  affectedPages: number,
): string | null {
  if (values.length === 0) return null;
  const parts = values.map(({ value, pages }) =>
    pages === affectedPages
      ? `${value} حرفًا`
      : `${value} حرفًا على ${arabicPages(pages)}`,
  );
  return `${label}: ${parts.join('، ')} (المطلوب ${ideal})`;
}

const EXACT_TRANSLATIONS: Record<string, string> = {
  'No <title> tag found.': 'لا يوجد وسم <title>',
  'No meta description found.': 'لا يوجد وصف Meta',
  'No H1 tag found on the page.': 'لا يوجد وسم H1',
  'No canonical tag found.': 'لا يوجد وسم canonical',
  'Site is not served over HTTPS.': 'الموقع لا يعمل عبر HTTPS',
  'No structured data (JSON-LD) found on the page.': 'لا توجد بيانات منظمة (JSON-LD)',
  'No H2 tags found. Sub-headings help content structure and SEO.':
    'لا توجد وسوم H2؛ العناوين الفرعية بتنظم المحتوى',
  'No viewport meta tag ? page may not be mobile-friendly.':
    'لا يوجد وسم viewport — الصفحة قد لا تكون متوافقة مع الموبايل',
  'robots.txt not found or not accessible.': 'ملف robots.txt غير موجود أو غير متاح',
  'Could not fetch or parse robots.txt.': 'تعذر جلب أو تحليل robots.txt',
  'robots.txt disallows "/" for all crawlers ? the entire site is blocked from indexing.':
    'ملف robots.txt بيمنع "/" لكل الزواحف — الموقع بالكامل محجوب عن الفهرسة',
  'No lang attribute on the <html> tag.': 'لا يوجد وسم lang على <html>',
  'No UTF-8 charset declared in meta tag or Content-Type header.': 'الترميز UTF-8 غير معلن',
};

const PATTERN_TRANSLATIONS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Found (\d+) H1 tags/, (m) => `عدد وسوم H1: ${m[1]} (الأفضل وسم واحد)`],
  [/^(\d+) of (\d+) images are missing alt text/, (m) => `${m[1]} من ${m[2]} صورة بدون نص بديل`],
  [
    /^Canonical tag points to a different URL \((.+?)\)\s*\?/,
    (m) => `الوسم canonical بيشير لرابط مختلف (${m[1]}) — الصفحة قد تُعتبر مكررة`,
  ],
  [/^Missing Open Graph tags: (.+?)\.?$/, (m) => `وسوم Open Graph ناقصة: ${m[1]}`],
  [/^Structured data issues: (.+?)\.?$/, (m) => `مشاكل في البيانات المنظمة: ${m[1]}`],
  [/^Invalid hreflang value\(s\): (.+?)\.?$/, (m) => `قيم hreflang غير صالحة: ${m[1]}`],
  [
    /^No self-referencing hreflang entry .*\((.+?)\)\.?$/,
    (m) => `لا يوجد إدخال hreflang للغة الصفحة (${m[1]})`,
  ],
  [
    /^Page has content="(.+?)"\s*\?/,
    (m) => `الصفحة فيها content="${m[1]}" — بتمنع محركات البحث من الفهرسة`,
  ],
  [/^Missing security headers: (.+?)\.?$/, (m) => `ترويسات أمان ناقصة: ${m[1]}`],
  [
    /^(\d+) of (\d+) checked internal links are broken: (.+?)\.?$/,
    (m) => `${m[1]} من ${m[2]} رابط داخلي مكسور: ${m[3]}`,
  ],
  [
    /^The word "(.+?)" makes up ([\d.]+)% of the page's text \((\d+) occurrences\)/,
    (m) => `كلمة "${m[1]}" بتشكل ${m[2]}% من النص (${m[3]} مرة)`,
  ],
  [
    /^Page has only (\d+) words/,
    (m) => `الصفحة فيها ${m[1]} كلمة فقط — قليلة لتقييم حشو الكلمات`,
  ],
  [
    /^<html lang="(.+?)"> doesn't look like a valid language code/,
    (m) => `قيمة lang="${m[1]}" مش كود لغة صالح`,
  ],
  [/^No usable sitemap found: (.+?)\.?$/, (m) => `لا توجد خريطة موقع صالحة: ${m[1]}`],
  [
    /^Sitemap index at (.+?) lists no child sitemap URLs/,
    (m) => `فهرس السايت ماب (${m[1]}) ما فيهوش روابط سايت ماب فرعية`,
  ],
  [
    /^Sitemap index at (.+?) lists (\d+) child sitemap\(s\) but none could be read \((\d+) failed\)/,
    (m) =>
      `فهرس السايت ماب (${m[1]}) بيذكر ${m[2]} سايت ماب فرعي، ومقدرناش نقرأ أي منهم (${m[3]} فشل)`,
  ],
  [
    /^Sitemap at (.+?) \((.+?)\) contains no <loc> URLs/,
    (m) => `السايت ماب (${m[1]}) لا يحتوي روابط <loc>`,
  ],
  [
    /^(\d+) of (\d+) sampled sitemap URLs errored \((.+?)\)\. Sitemap has (\d+) URLs/,
    (m) =>
      `${m[1]} من ${m[2]} رابط في السايت ماب فشل (${m[3]}) — إجمالي ${m[4]} رابط`,
  ],
  [
    /^Could not fetch or parse sitemap\.xml \((.+?)\)/,
    (m) => `تعذر جلب أو تحليل sitemap.xml (${m[1]})`,
  ],
];

function translateCoreWebVitals(message: string): string {
  return message
    .replace(/\(field, poor\)/g, '(ميداني، ضعيف)')
    .replace(/\(field, needs improvement\)/g, '(ميداني، يحتاج تحسين)')
    .replace(/\(field, good\)/g, '(ميداني، جيد)')
    .replace(/\(lab, poor\)/g, '(معملي، ضعيف)')
    .replace(/\(lab, needs improvement\)/g, '(معملي، يحتاج تحسين)')
    .replace(/\(lab, good\)/g, '(معملي، جيد)')
    .replace('are good', 'جيدة')
    .replace('are poor', 'ضعيفة')
    .replace('need improvement', 'تحتاج تحسين')
    .replace('could not be fully verified', 'تعذر التحقق الكامل منها')
    .replace('lab only, no field data yet', 'بيانات معملية فقط')
    .replace('Chrome UX url-level field data', 'بيانات ميدانية على مستوى الصفحة')
    .replace('Chrome UX origin-level field data', 'بيانات ميدانية على مستوى النطاق')
    .replace('lab + ', 'معملي + ')
    .replace('not measured:', 'لم يُقس:')
    .replace('Not counted in the score.', 'غير محسوبة في الدرجة.')
    .replace('Could not retrieve', 'تعذر جلب');
}

export function translateEvidenceMessage(message: string, lang: Language = 'ar'): string {
  const text = message.trim();
  if (lang === 'en') return text;

  if (EXACT_TRANSLATIONS[text]) return EXACT_TRANSLATIONS[text];

  if (text.startsWith('Core Web Vitals') || text.startsWith('Could not retrieve Core Web Vitals')) {
    return translateCoreWebVitals(text);
  }

  for (const [pattern, translate] of PATTERN_TRANSLATIONS) {
    const match = text.match(pattern);
    if (match) return translate(match);
  }

  return text;
}

export function buildEvidence(check: EvidenceInput, lang: Language = 'ar'): string {
  return lang === 'en' ? buildEnglishEvidence(check) : buildArabicEvidence(check);
}

function buildArabicEvidence(check: EvidenceInput): string {
  const affectedPages = check.failCount + check.warningCount;
  const totalPages = affectedPages + check.unknownCount + check.passCount;
  const scope =
    affectedPages === totalPages
      ? `على ${arabicPages(totalPages)}`
      : `على ${arabicPages(affectedPages)} من ${arabicPages(totalPages)}`;

  const entries = Object.entries(check.messageCounts);

  const titleValues = entries
    .map(([message, pages]) => {
      const match = message.match(TITLE_LENGTH);
      return match ? { value: Number(match[1]), pages } : null;
    })
    .filter((v): v is { value: number; pages: number } => v !== null);

  const metaValues = entries
    .map(([message, pages]) => {
      const match = message.match(META_LENGTH);
      return match ? { value: Number(match[1]), pages } : null;
    })
    .filter((v): v is { value: number; pages: number } => v !== null);

  const others = entries.filter(
    ([message]) => !TITLE_LENGTH.test(message) && !META_LENGTH.test(message),
  );

  const samples = others.map(([message, pages]) => {
    const text = translateEvidenceMessage(message);
    return pages === affectedPages ? text : `${text} على ${arabicPages(pages)}`;
  });

  const details = [
    lengthLine('طول العنوان', '30–60', titleValues, affectedPages),
    lengthLine('طول الوصف', '120–160', metaValues, affectedPages),
    ...samples.slice(0, MAX_SAMPLES),
  ].filter((line): line is string => line !== null);

  if (samples.length > MAX_SAMPLES) details.push('وغيرها');

  const unmeasured = Object.entries(check.unmeasured);
  if (unmeasured.length > 0) {
    details.push(
      `لم يُقس: ${unmeasured
        .map(([metric, pages]) => `${metric.toUpperCase()} (${arabicPages(pages)})`)
        .join('، ')}`,
    );
  }

  const facts = `${statusCounts(check.failCount, check.warningCount)} ${scope}`;
  return details.length > 0 ? `${facts} — ${details.join(' · ')}` : facts;
}

function englishPages(count: number): string {
  return `${count} ${count === 1 ? 'page' : 'pages'}`;
}

function englishStatusCounts(failCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (failCount > 0) parts.push(`${failCount} ${failCount === 1 ? 'failure' : 'failures'}`);
  if (warningCount > 0) {
    parts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`);
  }
  return parts.join(' and ') || 'no issues';
}

function englishLengthLine(
  label: string,
  ideal: string,
  values: { value: number; pages: number }[],
  affectedPages: number,
): string | null {
  if (values.length === 0) return null;
  const parts = values.map(({ value, pages }) =>
    pages === affectedPages
      ? `${value} characters`
      : `${value} characters on ${englishPages(pages)}`,
  );
  return `${label}: ${parts.join(', ')} (recommended ${ideal})`;
}

function buildEnglishEvidence(check: EvidenceInput): string {
  const affectedPages = check.failCount + check.warningCount;
  const totalPages = affectedPages + check.unknownCount + check.passCount;
  const scope =
    affectedPages === totalPages
      ? `on ${englishPages(totalPages)}`
      : `on ${englishPages(affectedPages)} of ${englishPages(totalPages)}`;

  const entries = Object.entries(check.messageCounts);

  const titleValues = entries
    .map(([message, pages]) => {
      const match = message.match(TITLE_LENGTH);
      return match ? { value: Number(match[1]), pages } : null;
    })
    .filter((v): v is { value: number; pages: number } => v !== null);

  const metaValues = entries
    .map(([message, pages]) => {
      const match = message.match(META_LENGTH);
      return match ? { value: Number(match[1]), pages } : null;
    })
    .filter((v): v is { value: number; pages: number } => v !== null);

  const others = entries.filter(
    ([message]) => !TITLE_LENGTH.test(message) && !META_LENGTH.test(message),
  );

  const samples = others.map(([message, pages]) => {
    const text = translateEvidenceMessage(message, 'en');
    return pages === affectedPages ? text : `${text} on ${englishPages(pages)}`;
  });

  const details = [
    englishLengthLine('Title length', '30–60', titleValues, affectedPages),
    englishLengthLine('Meta description length', '120–160', metaValues, affectedPages),
    ...samples.slice(0, MAX_SAMPLES),
  ].filter((line): line is string => line !== null);

  if (samples.length > MAX_SAMPLES) details.push('and more');

  const unmeasured = Object.entries(check.unmeasured);
  if (unmeasured.length > 0) {
    details.push(
      `Not measured: ${unmeasured
        .map(([metric, pages]) => `${metric.toUpperCase()} (${englishPages(pages)})`)
        .join(', ')}`,
    );
  }

  const facts = `${englishStatusCounts(check.failCount, check.warningCount)} ${scope}`;
  return details.length > 0 ? `${facts} — ${details.join(' · ')}` : facts;
}
