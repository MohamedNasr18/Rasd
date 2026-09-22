export interface DocSource {
  url: string;
  checkType: string;
  source: string;
  // CSS selector for the main content area — different sites structure differently
  contentSelector: string;
}

export const DOC_SOURCES: DocSource[] = [
  {
    url: 'https://web.dev/articles/lcp',
    checkType: 'core_web_vitals',
    source: 'web.dev - Largest Contentful Paint',
    contentSelector: 'article',
  },
  {
    url: 'https://web.dev/articles/cls',
    checkType: 'core_web_vitals',
    source: 'web.dev - Cumulative Layout Shift',
    contentSelector: 'article',
  },
  {
    url: 'https://web.dev/articles/inp',
    checkType: 'core_web_vitals',
    source: 'web.dev - Interaction to Next Paint',
    contentSelector: 'article',
  },
  {
    url: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    checkType: 'structured_data',
    source: 'Google Search Central - Product structured data',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/appearance/structured-data/article',
    checkType: 'structured_data',
    source: 'Google Search Central - Article structured data',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/appearance/title-link',
    checkType: 'title_tag',
    source: 'Google Search Central - Title links',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/appearance/snippet',
    checkType: 'meta_description',
    source: 'Google Search Central - Snippets & meta description',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
    checkType: 'robots_txt_content',
    source: 'Google Search Central - robots.txt introduction',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap',
    checkType: 'sitemap_content',
    source: 'Google Search Central - Building a sitemap',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/specialty/international/localized-versions',
    checkType: 'hreflang',
    source: 'Google Search Central - hreflang / localized versions',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
    checkType: 'canonical_tag',
    source: 'Google Search Central - Canonicalization',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag',
    checkType: 'meta_robots',
    source: 'Google Search Central - robots meta tag',
    contentSelector: 'article, main',
  },
  {
    url: 'https://nextjs.org/docs/app/building-your-application/optimizing/metadata',
    checkType: 'title_tag',
    source: 'Next.js Docs - Metadata',
    contentSelector: 'article, main',
  },
  {
    url: 'https://ogp.me/',
    checkType: 'open_graph_tags',
    source: 'Open Graph Protocol - Official spec',
    contentSelector: 'body',
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
    checkType: 'security_headers',
    source: 'MDN - Strict-Transport-Security',
    contentSelector: 'article, main',
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy',
    checkType: 'security_headers',
    source: 'MDN - Content-Security-Policy',
    contentSelector: 'article, main',
  },
];