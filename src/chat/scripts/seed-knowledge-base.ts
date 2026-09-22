import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers'; import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { DOC_SOURCES, DocSource } from './doc-sources.js';

const MIN_CONTENT_LENGTH = 200; 
const FETCH_DELAY_MS = 1000; 

async function fetchAndCleanContent(source: DocSource): Promise<string | null> {
  try {
    const res = await axios.get<string>(source.url, {
      timeout: 15000,
      headers: { 'User-Agent': 'RasdKnowledgeBaseBot/1.0 (+https://rasd.app)' },
    });

    const $ = cheerio.load(res.data);

    // Remove obviously non-content elements before extracting text
    $('script, style, noscript, nav, header, footer, aside, [role="navigation"]').remove();

    const container = $(source.contentSelector).first();
    const text = (container.length > 0 ? container.text() : $('body').text())
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < MIN_CONTENT_LENGTH) {
      console.warn(`⚠ Skipping ${source.url} — extracted content too short (${text.length} chars). Selector may be wrong for this site.`);
      return null;
    }

    return text;
  } catch (err: any) {
    console.warn(`⚠ Failed to fetch ${source.url}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`Seeding knowledge base from ${DOC_SOURCES.length} real documentation sources...\n`);

 const embeddings = new HuggingFaceTransformersEmbeddings({ model: 'Xenova/all-MiniLM-L6-v2' });  const vectorStore = await PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: process.env.DATABASE_URL },
    tableName: 'seo_knowledge_base',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'vector',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
  });

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });

  let totalChunks = 0;
  let successCount = 0;
  let failCount = 0;

  for (const source of DOC_SOURCES) {
    const text = await fetchAndCleanContent(source);

    if (!text) {
      failCount++;
      await delay(FETCH_DELAY_MS);
      continue;
    }

    const chunks = await splitter.splitText(text);
    const documents = chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk,
          metadata: { source: source.source, checkType: source.checkType, url: source.url },
        }),
    );

    await vectorStore.addDocuments(documents);
    totalChunks += documents.length;
    successCount++;
    console.log(`✓ ${source.source} — ${documents.length} chunks added`);

    await delay(FETCH_DELAY_MS);
  }

  console.log(`\nDone. ${successCount}/${DOC_SOURCES.length} sources succeeded, ${failCount} failed.`);
  console.log(`Total chunks inserted: ${totalChunks}`);

  if (failCount > 0) {
    console.log('\nFor failed sources, check the selector in doc-sources.ts or the URL validity — sites change their HTML structure over time.');
  }

  process.exit(0);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});