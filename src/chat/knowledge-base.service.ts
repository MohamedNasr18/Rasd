import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

interface SeedDoc {
  source: string;
  checkType: string;
  content: string;
}


const SEED_DOCUMENTS: SeedDoc[] = [
  {
    source: 'web.dev - Core Web Vitals',
    checkType: 'core_web_vitals',
    content: `Largest Contentful Paint (LCP) measures loading performance. To provide a good
user experience, LCP should occur within 2.5 seconds of when the page first starts loading.
Common causes of poor LCP: slow server response times, render-blocking JavaScript/CSS,
slow resource load times, and client-side rendering. Fixes include: optimizing server response
time, eliminating render-blocking resources, using a CDN, and preloading critical resources.`,
  },
  {
    source: 'web.dev - Cumulative Layout Shift',
    checkType: 'core_web_vitals',
    content: `Cumulative Layout Shift (CLS) measures visual stability. Sites should maintain a CLS
of 0.1 or less. Common causes: images without dimensions, ads/embeds without reserved space,
dynamically injected content, and web fonts causing FOIT/FOUT. Always include width and height
size attributes on images and video elements, or use CSS aspect-ratio.`,
  },
  {
    source: 'schema.org - Product',
    checkType: 'structured_data',
    content: `A Product schema should include: name (the product's name), image, description,
offers (with price, priceCurrency, and availability using schema.org/ItemAvailability values
like InStock, OutOfStock, PreOrder), and optionally aggregateRating and review. Use JSON-LD
format inside a <script type="application/ld+json"> tag in the page <head> or <body>.`,
  },
  {
    source: 'Next.js Docs - Metadata API',
    checkType: 'title_tag',
    content: `In Next.js App Router, page metadata (title, description) is set via the exported
metadata object or generateMetadata function in layout.tsx or page.tsx, not via <Head> or manual
<title> tags. Example: export const metadata = { title: '...', description: '...' }. This
approach ensures metadata is rendered server-side and is immediately visible to crawlers.`,
  },
  {
    source: 'React Docs - Document Metadata',
    checkType: 'title_tag',
    content: `In React 19+, you can render <title>, <meta>, and <link> tags directly inside any
component, and React will automatically hoist them into the document <head>. For older React
versions or when using Client-Side Rendering without a metadata framework, consider using
react-helmet-async, or migrate to a framework with built-in SSR support for reliable SEO.`,
  },
  {
    source: 'Google Search Central - robots.txt',
    checkType: 'robots_txt_content',
    content: `A robots.txt file tells search engine crawlers which pages they can or cannot
request. Disallow: / under User-agent: * blocks the entire site from being crawled — this
should almost never be used on a production site unless intentionally keeping the whole site
out of search results (e.g., a staging environment).`,
  },
];

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private documents: Document[] = [];

  async onModuleInit() {
    this.logger.log('Seeding knowledge base with initial documents...');
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 400, chunkOverlap: 40 });

    for (const doc of SEED_DOCUMENTS) {
      const chunks = await splitter.splitText(doc.content);
      chunks.forEach((chunk) =>
        this.documents.push(
          new Document({
            pageContent: chunk,
            metadata: { source: doc.source, checkType: doc.checkType },
          }),
        ),
      );
    }

    this.logger.log(`Seeded ${this.documents.length} document chunks.`);
  }

  async retrieveGuidance(query: string, checkType?: string): Promise<string[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = this.documents
      .filter((document) => !checkType || document.metadata.checkType === checkType)
      .map((document) => ({
        document,
        score: terms.reduce(
          (score, term) => score + (document.pageContent.toLowerCase().includes(term) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ document }) => document);
    return results.map((r) => `[${r.metadata.source}] ${r.pageContent}`);
  }
}