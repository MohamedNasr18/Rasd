import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import type { PageSpeedInsightsResponse } from './types/pagespeed.types.js';

export type CheckStatus = 'pass' | 'warning' | 'fail';

export interface SeoCheckResult {
  check: string;
  status: CheckStatus;
  message: string;
  weight?: number;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on',
  'with', 'as', 'by', 'at', 'from', 'that', 'this', 'are', 'was', 'were', 'be', 'been',
]);

@Injectable()
export class SeoAnalyzerService implements OnModuleDestroy {
  private readonly logger = new Logger(SeoAnalyzerService.name);
  private readonly linkCheckCache = new Map<string, { status: number; timestamp: number }>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000;
  private readonly cleanupInterval: NodeJS.Timeout;

  // Global rate limiter for link checking — shared across ALL concurrent page scans.
  // Limits to 3 simultaneous HTTP requests total, with 300ms between each slot release,
  // to avoid flooding the target server when scanning multiple pages in parallel.
  private readonly MAX_CONCURRENT_LINK_CHECKS = 3;
  private readonly LINK_CHECK_SLOT_DELAY_MS = 300;
  private activeLinkChecks = 0;
  private readonly linkCheckQueue: Array<() => void> = [];

  private acquireLinkCheckSlot(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.activeLinkChecks < this.MAX_CONCURRENT_LINK_CHECKS) {
          this.activeLinkChecks++;
          resolve();
        } else {
          this.linkCheckQueue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private releaseLinkCheckSlot(): void {
    setTimeout(() => {
      this.activeLinkChecks--;
      const next = this.linkCheckQueue.shift();
      if (next) next();
    }, this.LINK_CHECK_SLOT_DELAY_MS);
  }

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let removed = 0;
      for (const [key, entry] of this.linkCheckCache) {
        if (now - entry.timestamp >= this.CACHE_TTL_MS) {
          this.linkCheckCache.delete(key);
          removed++;
        }
      }
      if (removed > 0) this.logger.debug(`Cleaned ${removed} expired link-cache entries.`);
    }, 15 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  // Page-level checks — called once per page
  async analyze(
    html: string,
    url: string,
    headers: Record<string, string> = {},
  ): Promise<{ score: number; results: SeoCheckResult[] }> {
    const $ = cheerio.load(html);
    const isHttps = url.startsWith('https://');

    const results: SeoCheckResult[] = [
      this.checkTitle($),
      this.checkMetaDescription($),
      this.checkH1($),
      this.checkHeadingStructure($),
      this.checkImageAlts($),
      this.checkCanonical($, url),
      this.checkViewport($),
      this.checkHttps(isHttps),
      this.checkOpenGraph($),
      await this.checkCoreWebVitals(url),
      this.checkStructuredData($),
      this.checkHreflang($),
      this.checkMetaRobots($),
      this.checkLangAttribute($),
      this.checkCharset($, headers),
      this.checkKeywordStuffing($),
      await this.checkBrokenInternalLinks($, url),
      this.checkSecurityHeaders(headers),
    ];

    const score = this.computeScore(results);
    return { score, results };
  }

  // Site-level checks — called ONCE per site scan, not per page
  async analyzeSiteLevel(url: string): Promise<SeoCheckResult[]> {
    return [
      await this.checkRobotsTxtContent(url),
      await this.checkSitemapContent(url),
    ];
  }

  // ===== EXISTING CHECKS =====

  private checkTitle($: cheerio.CheerioAPI): SeoCheckResult {
  const title = $('head > title').first().text().trim();
  if (!title) {
    return { check: 'title_tag', status: 'fail', message: 'No <title> tag found.', weight: 2 };
  }
  if (title.length < 30 || title.length > 60) {
    return { check: 'title_tag', status: 'warning', message: `Title length is ${title.length} chars. Ideal range is 30-60.`, weight: 2 };
  }
  return { check: 'title_tag', status: 'pass', message: `Title looks good ("${title}").`, weight: 2 };
}

  private checkMetaDescription($: cheerio.CheerioAPI): SeoCheckResult {
    const desc = $('meta[name="description"]').attr('content')?.trim();
    if (!desc) {
      return { check: 'meta_description', status: 'fail', message: 'No meta description found.', weight: 2 };
    }
    if (desc.length < 120 || desc.length > 160) {
      return { check: 'meta_description', status: 'warning', message: `Meta description is ${desc.length} chars. Ideal range is 120-160.`, weight: 2 };
    }
    return { check: 'meta_description', status: 'pass', message: 'Meta description looks good.', weight: 2 };
  }

  private checkH1($: cheerio.CheerioAPI): SeoCheckResult {
    const h1s = $('h1');
    if (h1s.length === 0) {
      return { check: 'h1_tag', status: 'fail', message: 'No H1 tag found on the page.', weight: 2 };
    }
    if (h1s.length > 1) {
      return { check: 'h1_tag', status: 'warning', message: `Found ${h1s.length} H1 tags. Best practice is exactly one.`, weight: 2 };
    }
    return { check: 'h1_tag', status: 'pass', message: 'Exactly one H1 tag found.', weight: 2 };
  }

  private checkHeadingStructure($: cheerio.CheerioAPI): SeoCheckResult {
    const h2Count = $('h2').length;
    if (h2Count === 0) {
      return { check: 'heading_structure', status: 'warning', message: 'No H2 tags found. Sub-headings help content structure and SEO.', weight: 1 };
    }
    return { check: 'heading_structure', status: 'pass', message: `Found ${h2Count} H2 tags.`, weight: 1 };
  }

  private checkImageAlts($: cheerio.CheerioAPI): SeoCheckResult {
    // Only count images that are actually rendered/visible:
    // - Must have a real src (not empty, not a blank data URI placeholder)
    // - OR have a srcset
    // Excludes lazy-loaded images that haven't resolved yet (src="" or tiny gif placeholders)
    // and images that use data-src/data-srcset only (not yet swapped by JS intersection observer)
    const allImages = $('img');
    const loadedImages = allImages.filter((_, el) => {
      const src = $(el).attr('src')?.trim() ?? '';
      const srcset = $(el).attr('srcset')?.trim() ?? '';

      // Common lazy-load placeholder patterns to exclude:
      // - empty src
      // - 1x1 transparent GIF (data:image/gif;base64,R0lGOD...)
      // - blank data URI (data:,)
      // - "about:blank" or "#"
      const isPlaceholderSrc =
        src === '' ||
        src === 'data:,' ||
        src === 'about:blank' ||
        src === '#' ||
        /^data:image\/gif;base64,R0lGOD/i.test(src) ||
        /^data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB/i.test(src); // 1x1 png

      const hasRealSrc = src.length > 0 && !isPlaceholderSrc;
      const hasRealSrcset = srcset.length > 0;

      return hasRealSrc || hasRealSrcset;
    });

    if (loadedImages.length === 0) {
      return { check: 'image_alt_tags', status: 'pass', message: 'No images found on the page.', weight: 1 };
    }

    const missing = loadedImages.filter((_, el) => !$(el).attr('alt')?.trim()).length;
    if (missing > 0) {
      return { check: 'image_alt_tags', status: 'fail', message: `${missing} of ${loadedImages.length} images are missing alt text.`, weight: 1 };
    }
    return { check: 'image_alt_tags', status: 'pass', message: 'All images have alt text.', weight: 1 };
  }

  private checkCanonical($: cheerio.CheerioAPI, pageUrl?: string): SeoCheckResult {
    const canonical = $('link[rel="canonical"]').attr('href');
    if (!canonical) {
      return { check: 'canonical_tag', status: 'warning', message: 'No canonical tag found.', weight: 2 };
    }

    // If we know the page URL, verify canonical is self-referencing
    if (pageUrl) {
      try {
        const normalizeForCompare = (u: string) => {
          const parsed = new URL(u);
          // Strip trailing slash and fragment for comparison
          let path = parsed.pathname.replace(/\/$/, '') || '/';
          return parsed.origin + path;
        };
        const canonicalNorm = normalizeForCompare(canonical);
        const pageNorm = normalizeForCompare(pageUrl);
        if (canonicalNorm !== pageNorm) {
          return {
            check: 'canonical_tag',
            status: 'warning',
            message: `Canonical tag points to a different URL (${canonical}) — this page may be treated as a duplicate. Verify this is intentional.`,
            weight: 2,
          };
        }
      } catch {
        // If URL parsing fails, fall through to pass
      }
    }

    return { check: 'canonical_tag', status: 'pass', message: `Canonical tag set to ${canonical}.`, weight: 2 };
  }

  private checkViewport($: cheerio.CheerioAPI): SeoCheckResult {
    const viewport = $('meta[name="viewport"]').attr('content');
    if (!viewport) {
      return { check: 'mobile_viewport', status: 'fail', message: 'No viewport meta tag — page may not be mobile-friendly.', weight: 2 };
    }
    return { check: 'mobile_viewport', status: 'pass', message: 'Viewport meta tag present.', weight: 2 };
  }

  private checkHttps(isHttps: boolean): SeoCheckResult {
    if (!isHttps) {
      return { check: 'https', status: 'fail', message: 'Site is not served over HTTPS.', weight: 3 };
    }
    return { check: 'https', status: 'pass', message: 'Site uses HTTPS.', weight: 3 };
  }

  private checkOpenGraph($: cheerio.CheerioAPI): SeoCheckResult {
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const missing = [!ogTitle && 'og:title', !ogDesc && 'og:description', !ogImage && 'og:image'].filter(Boolean);

    if (missing.length > 0) {
      return { check: 'open_graph_tags', status: 'warning', message: `Missing Open Graph tags: ${missing.join(', ')}.`, weight: 1 };
    }
    return { check: 'open_graph_tags', status: 'pass', message: 'All key Open Graph tags present.', weight: 1 };
  }

 private async fetchPsiWithRetry(url: string, maxRetries = 2): Promise<AxiosResponse<PageSpeedInsightsResponse>> {
  const timeouts = [30000, 45000, 60000];
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.get<PageSpeedInsightsResponse>(
        'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
        {
          params: { url, key: process.env.PAGESPEED_API_KEY, category: 'PERFORMANCE', strategy: 'MOBILE' },
          timeout: timeouts[attempt] ?? timeouts[timeouts.length - 1],
        },
      );
    } catch (err) {
      lastErr = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const isTimeout = axios.isAxiosError(err) && err.code === 'ECONNABORTED';
      const isRateLimited = status === 429;
      // لا استجابة خالص = مشكلة اتصال (DNS, reset, refused..) — دي قابلة للـ retry
      // بشرط إنها مش timeout (already handled) ومفيش status code (يعني مش HTTP error زي 400/401)
      const isNetworkError = axios.isAxiosError(err) && !err.response && !isTimeout;

      if (attempt === maxRetries || !(isRateLimited || isTimeout || isNetworkError)) {
        throw err;
      }

      const backoffMs = isRateLimited ? 3000 * (attempt + 1) : 500;
      const reason = isRateLimited ? '429 rate limited' : isTimeout ? 'timeout' : 'network error';
      this.logger.warn(
        `PageSpeed attempt ${attempt + 1} failed for ${url} (${reason}) — retrying with a longer timeout in ${backoffMs}ms`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

private async checkCoreWebVitals(url: string): Promise<SeoCheckResult> {
  try {
    const response = await this.fetchPsiWithRetry(url);
    const audits = response.data.lighthouseResult?.audits;
    if (!audits) {
      return { check: 'core_web_vitals', status: 'warning', message: 'PageSpeed Insights returned no Lighthouse data.', weight: 3 };
    }

    const lcp = audits['largest-contentful-paint']?.numericValue;
    const cls = audits['cumulative-layout-shift']?.numericValue;

    // INP مش lab audit — بييجي من field data (CrUX) بس. لو الصفحة معندهاش
    // زيارات كفاية، مفيش field data وهيفضل undefined، وده صح مش نقص.
    const inp = response.data.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile
      ?? response.data.originLoadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile;

    const issues: string[] = [];
    if (lcp !== undefined && lcp > 2500) issues.push(`LCP ${(lcp / 1000).toFixed(1)}s`);
    if (cls !== undefined && cls > 0.1) issues.push(`CLS ${cls.toFixed(2)}`);
    if (inp !== undefined && inp > 200) issues.push(`INP ${Math.round(inp)}ms`);

    if (issues.length === 0) {
      return { check: 'core_web_vitals', status: 'pass', message: "Core Web Vitals are within Google's recommended thresholds.", weight: 3 };
    }
    return { check: 'core_web_vitals', status: 'fail', message: `Core Web Vitals failing thresholds: ${issues.join(', ')}.`, weight: 3 };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const isTimeout = axios.isAxiosError(err) && err.code === 'ECONNABORTED';
    const reason = status === 429
      ? 'rate limited after retries'
      : isTimeout
        ? 'timed out after retries — this page may simply be too slow for PSI to finish analyzing'
        : status
          ? `HTTP ${status}`
          : 'network error after retries';

    this.logger.warn(`PageSpeed API failed for ${url}: ${reason}`);
    return { check: 'core_web_vitals', status: 'warning', message: `Could not retrieve Core Web Vitals (${reason}).`, weight: 3 };
  }
}

  private checkStructuredData($: cheerio.CheerioAPI): SeoCheckResult {
    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length === 0) {
      return { check: 'structured_data', status: 'warning', message: 'No structured data (JSON-LD) found on the page.', weight: 2 };
    }

    const requiredFieldsByType: Record<string, string[]> = {
      Product: ['name', 'offers.price', 'offers.availability'],
      Article: ['headline', 'author', 'datePublished'],
    };

    const problems: string[] = [];
    let validCount = 0;

    scripts.each((_, el) => {
      let parsed: any;
      try {
        parsed = JSON.parse($(el).contents().text());
      } catch {
        problems.push('a block contains invalid JSON');
        return;
      }

      const required = requiredFieldsByType[parsed['@type']];
      if (!required) {
        validCount++;
        return;
      }

      const missing = required.filter((path) => {
        const value = path.split('.').reduce((obj, key) => obj?.[key], parsed);
        return value === undefined || value === null || value === '';
      });

      if (missing.length > 0) {
        problems.push(`"${parsed['@type']}" schema is missing: ${missing.join(', ')}`);
      } else {
        validCount++;
      }
    });

    if (problems.length > 0) {
      return { check: 'structured_data', status: 'fail', message: `Structured data issues: ${problems.join('; ')}.`, weight: 2 };
    }
    return { check: 'structured_data', status: 'pass', message: `${validCount} valid structured data block(s) found.`, weight: 2 };
  }

  private checkHreflang($: cheerio.CheerioAPI): SeoCheckResult {
    const tags = $('link[rel="alternate"][hreflang]');
    if (tags.length === 0) {
      return { check: 'hreflang', status: 'pass', message: 'No hreflang tags found (fine for single-language sites).', weight: 1 };
    }

    const bcp47Pattern = /^([a-zA-Z]{2,3})(-[a-zA-Z0-9]{2,8})*$|^x-default$/;
    const invalid: string[] = [];
    let hasSelfReference = false;
    const pageLang = $('html').attr('lang')?.toLowerCase();

    tags.each((_, el) => {
      const value = $(el).attr('hreflang') || '';
      if (!bcp47Pattern.test(value)) invalid.push(value);
      if (pageLang && value.toLowerCase() === pageLang) hasSelfReference = true;
    });

    if (invalid.length > 0) {
      return { check: 'hreflang', status: 'fail', message: `Invalid hreflang value(s): ${invalid.join(', ')}.`, weight: 1 };
    }
    if (pageLang && !hasSelfReference) {
      return { check: 'hreflang', status: 'warning', message: `No self-referencing hreflang entry for the page's own language (${pageLang}).`, weight: 1 };
    }
    return { check: 'hreflang', status: 'pass', message: 'hreflang tags are valid.', weight: 1 };
  }

  // Bug fix #1: weight is now a fixed constant across all branches
  private checkMetaRobots($: cheerio.CheerioAPI): SeoCheckResult {
    const content = $('meta[name="robots"]').attr('content')?.toLowerCase();
    const weight = 3;

    if (!content) {
      return { check: 'meta_robots', status: 'pass', message: 'No meta robots restrictions found.', weight };
    }
    if (content.includes('noindex')) {
      return { check: 'meta_robots', status: 'warning', message: `Page has content="${content}" — this tells search engines NOT to index it. Confirm that's intentional.`, weight };
    }
    return { check: 'meta_robots', status: 'pass', message: `Meta robots set to "${content}".`, weight };
  }

  private async checkRobotsTxtContent(url: string): Promise<SeoCheckResult> {
    try {
      const base = new URL(url);
      const res = await axios.get<string>(`${base.protocol}//${base.host}/robots.txt`, { timeout: 5000, validateStatus: () => true });

      if (res.status !== 200) {
        return { check: 'robots_txt_content', status: 'warning', message: 'robots.txt not found or not accessible.', weight: 2 };
      }

      const lines = String(res.data).split('\n').map((l) => l.trim().toLowerCase());
      let wildcardAgent = false;
      let blocksEverything = false;

      for (const line of lines) {
        if (line.startsWith('user-agent:')) {
          wildcardAgent = line.replace('user-agent:', '').trim() === '*';
        }
        if (wildcardAgent && line.startsWith('disallow:') && line.replace('disallow:', '').trim() === '/') {
          blocksEverything = true;
        }
      }

      if (blocksEverything) {
        return { check: 'robots_txt_content', status: 'fail', message: 'robots.txt disallows "/" for all crawlers — the entire site is blocked from indexing.', weight: 3 };
      }
      return { check: 'robots_txt_content', status: 'pass', message: 'robots.txt does not fully block crawling.', weight: 2 };
    } catch {
      return { check: 'robots_txt_content', status: 'warning', message: 'Could not fetch or parse robots.txt.', weight: 2 };
    }
  }

  private async checkSitemapContent(url: string): Promise<SeoCheckResult> {
    try {
      const base = new URL(url);
      const res = await axios.get<string>(`${base.protocol}//${base.host}/sitemap.xml`, { timeout: 5000, validateStatus: () => true });

      if (res.status !== 200) {
        return { check: 'sitemap_content', status: 'warning', message: 'sitemap.xml not found at the default path.', weight: 2 };
      }

      const $sitemap = cheerio.load(res.data, { xmlMode: true });
      const urls = $sitemap('url > loc').map((_, el) => $sitemap(el).text()).get();

      if (urls.length === 0) {
        return { check: 'sitemap_content', status: 'warning', message: 'sitemap.xml has no <url> entries.', weight: 2 };
      }

      const sample = [...urls].sort(() => 0.5 - Math.random()).slice(0, 5);
      const checks = await Promise.allSettled(sample.map((u) => axios.head(u, { timeout: 5000, validateStatus: () => true })));
      const broken = checks.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status >= 400)).length;

      if (broken > 0) {
        return { check: 'sitemap_content', status: 'warning', message: `${broken} of ${sample.length} sampled sitemap URLs errored. Sitemap has ${urls.length} URLs total.`, weight: 2 };
      }
      return { check: 'sitemap_content', status: 'pass', message: `Sitemap contains ${urls.length} URLs; sampled entries are reachable.`, weight: 2 };
    } catch {
      return { check: 'sitemap_content', status: 'warning', message: 'Could not fetch or parse sitemap.xml.', weight: 2 };
    }
  }

  private checkLangAttribute($: cheerio.CheerioAPI): SeoCheckResult {
    const lang = $('html').attr('lang');
    if (!lang) {
      return { check: 'lang_attribute', status: 'fail', message: 'No lang attribute on the <html> tag.', weight: 1 };
    }
    if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) {
      return { check: 'lang_attribute', status: 'warning', message: `<html lang="${lang}"> doesn't look like a valid language code.`, weight: 1 };
    }
    return { check: 'lang_attribute', status: 'pass', message: `Language declared as "${lang}".`, weight: 1 };
  }

  private checkCharset($: cheerio.CheerioAPI, headers: Record<string, string> = {}): SeoCheckResult {
  const metaCharset = $('meta[charset]').attr('charset')?.toLowerCase()
    || $('meta[http-equiv="Content-Type"]').attr('content')?.toLowerCase();

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const headerContentType = normalizedHeaders['content-type']?.toLowerCase();

  const hasUtf8 = metaCharset?.includes('utf-8') || headerContentType?.includes('utf-8');

  if (!hasUtf8) {
    return { check: 'charset', status: 'warning', message: 'No UTF-8 charset declared in meta tag or Content-Type header.', weight: 1 };
  }
  return { check: 'charset', status: 'pass', message: 'UTF-8 charset declared.', weight: 1 };
}

  // Bug fix #4: minimum word-count floor + absolute-repeat-count guard
 private checkKeywordStuffing($: cheerio.CheerioAPI): SeoCheckResult {
  const bodyClone = $('body').clone();
  bodyClone.find('script, style, noscript, template').remove();

  const text = bodyClone.text().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = text.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));

    const MIN_WORDS_FOR_RELIABLE_CHECK = 150;
    if (words.length < MIN_WORDS_FOR_RELIABLE_CHECK) {
      return {
        check: 'keyword_stuffing',
        status: 'pass',
        message: `Page has only ${words.length} words after filtering — too little content to reliably evaluate keyword stuffing.`,
        weight: 1,
      };
    }

    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

    let topWord = '';
    let topCount = 0;
    for (const [word, count] of freq) {
      if (count > topCount) { topWord = word; topCount = count; }
    }

    const ratio = topCount / words.length;
    if (ratio > 0.05 && topCount >= 8) {
      return { check: 'keyword_stuffing', status: 'warning', message: `The word "${topWord}" makes up ${(ratio * 100).toFixed(1)}% of the page's text (${topCount} occurrences) — possible keyword stuffing.`, weight: 1 };
    }
    return { check: 'keyword_stuffing', status: 'pass', message: 'No excessive keyword repetition detected.', weight: 1 };
  }

  // Bug fix #2: GET fallback for HEAD-rejecting servers, plus caching for shared nav/footer links
private async checkUrlReachable(url: string): Promise<number> {
  const cached = this.linkCheckCache.get(url);
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
    return cached.status;
  }

  // Acquire a global rate-limit slot before making the HTTP request.
  // This ensures at most MAX_CONCURRENT_LINK_CHECKS requests run at once
  // across all parallel page scans, preventing server flooding.
  await this.acquireLinkCheckSlot();
  let status: number;
  try {
    const headRes = await axios.head(url, { timeout: 8000, validateStatus: () => true });
    if (headRes.status === 405) {
      const getRes = await axios.get(url, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { Range: 'bytes=0-0' },
      });
      status = getRes.status;
    } else {
      status = headRes.status;
    }
  } catch {
    status = 0;
  } finally {
    this.releaseLinkCheckSlot();
  }

  this.linkCheckCache.set(url, { status, timestamp: Date.now() });
  return status;
}

private async checkUrlReachableWithRetry(url: string): Promise<number> {
  const firstResult = await this.checkUrlReachable(url);

  if (firstResult === 0) {
    this.linkCheckCache.delete(url);
    const retryResult = await this.checkUrlReachable(url);
    return retryResult;
  }

  return firstResult;
}

private async checkBrokenInternalLinks($: cheerio.CheerioAPI, url: string): Promise<SeoCheckResult> {
  const base = new URL(url);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, base);
      if (resolved.host === base.host) links.add(resolved.href);
    } catch { /* ignore malformed hrefs */ }
  });

  const sample = Array.from(links).slice(0, 20);
  if (sample.length === 0) {
    return { check: 'broken_internal_links', status: 'pass', message: 'No internal links found to check.', weight: 2 };
  }

  
  const statuses = await Promise.all(sample.map((link) => this.checkUrlReachableWithRetry(link)));

  const brokenLinks = sample
    .map((link, i) => ({ link, status: statuses[i] }))
    .filter((entry) => entry.status === 0 || entry.status >= 400);

  if (brokenLinks.length > 0) {
    const details = brokenLinks
      .map((entry) => {
        const label = entry.status === 0
          ? 'timeout/unreachable after retry'
          : `HTTP ${entry.status}`;
        return `${entry.link} (${label})`;
      })
      .join(', ');
    return {
      check: 'broken_internal_links',
      status: 'fail',
      message: `${brokenLinks.length} of ${sample.length} checked internal links are broken: ${details}.`,
      weight: 2,
    };
  }
  return { check: 'broken_internal_links', status: 'pass', message: `Checked ${sample.length} internal links — all reachable.`, weight: 2 };
}

  private checkSecurityHeaders(headers: Record<string, string>): SeoCheckResult {
    const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const required = ['strict-transport-security', 'x-content-type-options', 'content-security-policy'];
    const missing = required.filter((h) => !normalized[h]);

    if (missing.length > 0) {
      return { check: 'security_headers', status: 'warning', message: `Missing security headers: ${missing.join(', ')}.`, weight: 1 };
    }
    return { check: 'security_headers', status: 'pass', message: 'All key security headers are present.', weight: 1 };
  }

  private computeScore(results: SeoCheckResult[]): number {
    const statusWeight = { pass: 1, warning: 0.5, fail: 0 };
    let totalWeight = 0;
    let earned = 0;

    for (const r of results) {
      const w = r.weight ?? 1;
      totalWeight += w;
      earned += w * statusWeight[r.status];
    }

    return Math.round((earned / totalWeight) * 100);
  }
}