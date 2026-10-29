import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseSitemapXml, parseRobotsSitemaps } from './sitemap.utils.js';

const DEFAULT_MAX_PAGES = 3;
const CRAWL_DELAY_MS = 600;
const MAX_CHILD_SITEMAPS = 5;

@Injectable()
export class SiteCrawlerService {
  private readonly logger = new Logger(SiteCrawlerService.name);

  async discoverPages(startUrl: string, maxPages: number = DEFAULT_MAX_PAGES): Promise<string[]> {
    const base = new URL(startUrl);
    const disallowedPaths = await this.getDisallowedPaths(base);
    const start = this.normalizeUrl(startUrl);

    const fromSitemap = await this.tryGetSitemapUrls(base, maxPages, disallowedPaths);
    if (fromSitemap.length > 0) {
      const pages = [start, ...fromSitemap.filter((url) => url !== start)].slice(0, maxPages);
      this.logger.log(`Discovered ${pages.length} pages (start URL + sitemap)`);
      return pages;
    }

    this.logger.log('No sitemap found — falling back to link crawling.');
    return this.crawlInternalLinks(startUrl, maxPages, disallowedPaths);
  }

  private async getDisallowedPaths(base: URL): Promise<string[]> {
    try {
      const res = await axios.get<string>(`${base.protocol}//${base.host}/robots.txt`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      if (res.status !== 200) return [];

      const lines = String(res.data).split('\n').map((l) => l.trim());
      const disallowed: string[] = [];
      let wildcardAgent = false;

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('user-agent:')) {
          wildcardAgent = lower.replace('user-agent:', '').trim() === '*';
        }
        if (wildcardAgent && lower.startsWith('disallow:')) {
          const path = line.split(':').slice(1).join(':').trim();
          if (path) disallowed.push(path);
        }
      }
      return disallowed;
    } catch {
      return [];
    }
  }

  private isAllowed(pathname: string, disallowedPaths: string[]): boolean {
    return !disallowedPaths.some((rule) => pathname.startsWith(rule));
  }

  private async tryGetSitemapUrls(base: URL, maxPages: number, disallowedPaths: string[]): Promise<string[]> {
  const origin = `${base.protocol}//${base.host}`;
  const candidates = [...new Set([`${origin}/sitemap.xml`, ...(await this.getRobotsSitemaps(origin))])];

  for (const candidate of candidates) {
    try {
      const res = await axios.get<string>(candidate, { timeout: 5000, validateStatus: () => true });
      if (res.status !== 200) continue;

      const parsed = parseSitemapXml(String(res.data));
      if (parsed.kind === 'unknown') continue;

      let urls = parsed.urls;

      if (parsed.kind === 'sitemapindex') {
        const children = parsed.children.filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_CHILD_SITEMAPS);
        const childResults = await Promise.allSettled(
          children.map(async (child) => {
            const childRes = await axios.get<string>(child, { timeout: 5000, validateStatus: () => true });
            if (childRes.status !== 200) throw new Error(`HTTP ${childRes.status}`);
            return parseSitemapXml(String(childRes.data));
          }),
        );
        urls = childResults.flatMap((result) =>
          result.status === 'fulfilled' && result.value.kind === 'urlset' ? result.value.urls : [],
        );
      }

      const seen = new Set<string>();
      const allowed: string[] = [];
      for (const u of urls) {
        try {
          const normalized = this.normalizeUrl(u);
          if (seen.has(normalized)) continue;
          if (!this.isAllowed(new URL(u).pathname, disallowedPaths)) continue;
          seen.add(normalized);
          allowed.push(normalized);
        } catch { }
      }

      if (allowed.length > 0) return allowed.slice(0, maxPages);
    } catch {
    }
  }

  return [];
}

  private async getRobotsSitemaps(origin: string): Promise<string[]> {
    try {
      const res = await axios.get<string>(`${origin}/robots.txt`, {
        timeout: 5000,
        validateStatus: () => true,
      });
      return res.status === 200 ? parseRobotsSitemaps(String(res.data)) : [];
    } catch {
      return [];
    }
  }

  private normalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl);
  const pathname = u.pathname.length > 1 && u.pathname.endsWith('/')
    ? u.pathname.slice(0, -1)
    : u.pathname;
  return u.origin + pathname;
}

private async crawlInternalLinks(startUrl: string, maxPages: number, disallowedPaths: string[]): Promise<string[]> {
  const base = new URL(startUrl);
  const visited = new Set<string>();
  const queue: string[] = [this.normalizeUrl(startUrl)];
  const discovered: string[] = [];

  while (queue.length > 0 && discovered.length < maxPages) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    try {
      await this.delay(CRAWL_DELAY_MS);
      const res = await axios.get<string>(current, { timeout: 8000 });
      const $ = cheerio.load(res.data);
      discovered.push(current);

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        try {
          const resolved = new URL(href, base);
          const isSameHost = resolved.host === base.host;
          const isAssetFile = /\.(jpg|jpeg|png|gif|svg|pdf|zip|css|js|ico|webp)$/i.test(resolved.pathname);
          const isAllowedPath = this.isAllowed(resolved.pathname, disallowedPaths);

          if (isSameHost && !isAssetFile && isAllowedPath) {
            const clean = this.normalizeUrl(resolved.href);
            if (!visited.has(clean)) queue.push(clean);
          }
        } catch { }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not crawl ${current}: ${message}`);
    }
  }

  return discovered;
}
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}