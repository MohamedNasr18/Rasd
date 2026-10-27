import 'dotenv/config';
import { Client } from 'pg';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Document } from '@langchain/core/documents';

/**
 * Curated facts that the crawled documentation does not state explicitly.
 * The web.dev INP article says INP is FID's "successor" but never says FID was
 * retired from Core Web Vitals, so the 500-char chunks alone let the model fall
 * back to its stale memory (FID + onFID).
 *
 * Idempotent: re-running replaces the rows owned by SOURCE.
 */
const SOURCE = 'Rasd - Core Web Vitals facts';

const FACTS: Array<{ checkType: string; content: string }> = [
  {
    checkType: 'core_web_vitals',
    content:
      'مقاييس Core Web Vitals الحالية ثلاثة فقط: Largest Contentful Paint (LCP) وInteraction to Next Paint (INP) وCumulative Layout Shift (CLS). مقياس First Input Delay (FID) اتشال من Core Web Vitals وحل محله INP في مارس 2024. أي جدول أو كود بيستخدم FID كأحد Core Web Vitals يعتبر قديم ومرفوض.',
  },
  {
    checkType: 'core_web_vitals',
    content:
      'FID (First Input Delay) is retired: Google replaced First Input Delay with Interaction to Next Paint (INP) as a Core Web Vital in March 2024. FID is deprecated and must not be reported as a current metric, and onFID must not be used; the modern web-vitals library (v3 and later) exposes onINP instead. PageSpeed Insights, Lighthouse and the Chrome UX Report report INP, not FID.',
  },
  {
    checkType: 'core_web_vitals',
    content:
      'حدود INP: good ≤ 200ms، needs improvement من 200ms لحد 500ms، poor > 500ms. INP بيقيس أبطأ تفاعل في الصفحة من لحظة الإدخال لحد ما المتصفح يرسم الإطار التالي، على مدار عمر الصفحة كلها. تحسين INP بيتم بتقليل الـ long tasks وتقسيم الـ JavaScript وتأجيل الشغل غير الضروري.',
  },
];

async function main() {
  const embeddings = new HuggingFaceTransformersEmbeddings({ model: 'Xenova/all-MiniLM-L6-v2' });
  const vectorStore = await PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: process.env.DATABASE_URL },
    tableName: 'seo_knowledge_base',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'vector',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const removed = await client.query(
    `delete from seo_knowledge_base where metadata->>'source' = $1`,
    [SOURCE],
  );
  await client.end();
  console.log(`Removed ${removed.rowCount} existing "${SOURCE}" chunk(s).`);

  const documents = FACTS.map(
    (fact) =>
      new Document({
        pageContent: fact.content,
        metadata: { source: SOURCE, checkType: fact.checkType, url: 'internal://core-web-vitals-facts' },
      }),
  );
  await vectorStore.addDocuments(documents);
  console.log(`Inserted ${documents.length} curated fact chunk(s).`);

  for (const query of ['مقاييس Core Web Vitals الحالية', 'FID retired replaced by INP']) {
    const results = await vectorStore.similaritySearch(query, 3);
    console.log(`\nQuery: ${query}`);
    for (const [i, r] of results.entries()) {
      console.log(`  ${i + 1}. [${r.metadata.source}] ${r.pageContent.slice(0, 90)}...`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding fixed facts failed:', err);
  process.exit(1);
});
