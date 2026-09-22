import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

const DEFAULT_MAX_PAGES = 3; 
const CRAWL_DELAY_MS = 600;

@Injectable()
export class SiteCrawlerService {
  private readonly logger = new Logger(SiteCrawlerService.name);

  async discoverPages(startUrl: string, maxPages: number = DEFAULT_MAX_PAGES): Promise<string[]> {
    const base = new URL(startUrl);
    const disallowedPaths = await this.getDisallowedPaths(base);

    const fromSitemap = await this.tryGetSitemapUrls(base, maxPages, disallowedPaths);
    if (fromSitemap.length > 0) {
      this.logger.log(`Discovered ${fromSitemap.length} pages from sitemap.xml`);
      return fromSitemap;
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
  try {
    const res = await axios.get<string>(`${base.protocol}//${base.host}/sitemap.xml`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    if (res.status !== 200) return [];

    const $ = cheerio.load(res.data, { xmlMode: true });
    const urls = $('url > loc').map((_, el) => $(el).text()).get();

    const seen = new Set<string>();
    const allowed: string[] = [];
    for (const u of urls) {
      try {
        const normalized = this.normalizeUrl(u);
        if (seen.has(normalized)) continue;
        if (!this.isAllowed(new URL(u).pathname, disallowedPaths)) continue;
        seen.add(normalized);
        allowed.push(normalized);
      } catch { /* skip malformed */ }
    }
    return allowed.slice(0, maxPages);
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
        } catch { /* ignore malformed hrefs */ }
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