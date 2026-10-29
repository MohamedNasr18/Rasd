import * as cheerio from 'cheerio';

export type SitemapKind = 'urlset' | 'sitemapindex' | 'unknown';

export function parseSitemapXml(xml: string): { kind: SitemapKind; urls: string[]; children: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const rootName = ($.root().children().first().get(0) as { tagName?: string } | undefined)?.tagName?.toLowerCase() ?? '';
  const urls = $('urlset > url > loc').map((_, el) => $(el).text().trim()).get();
  const children = $('sitemapindex > sitemap > loc').map((_, el) => $(el).text().trim()).get();

  if (rootName !== 'urlset' && rootName !== 'sitemapindex') {
    return { kind: 'unknown', urls: [], children: [] };
  }
  return { kind: rootName, urls, children };
}

export function parseRobotsSitemaps(robots: string): string[] {
  return robots
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^sitemap\s*:/i.test(line))
    .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
    .filter((line) => /^https?:\/\//i.test(line));
}
