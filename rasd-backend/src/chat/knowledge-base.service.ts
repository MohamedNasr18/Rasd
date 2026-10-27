import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private vectorStore: PGVectorStore;
  private readonly embeddings = new HuggingFaceTransformersEmbeddings({
    model: 'Xenova/all-MiniLM-L6-v2',
  });

  async onModuleInit() {
    this.vectorStore = await PGVectorStore.initialize(this.embeddings, {
      postgresConnectionOptions: { connectionString: process.env.DATABASE_URL },
      tableName: 'seo_knowledge_base',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'vector',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
    });

    const count = await this.vectorStore.similaritySearch('SEO', 1);
    if (count.length === 0) {
      this.logger.warn(
        'Knowledge base is empty. Run "npm run seed:kb" to populate it from real documentation sources before using the chatbot.',
      );
    }
  }

  async retrieveGuidance(query: string, checkType?: string): Promise<string[]> {
    const filter = checkType ? { checkType } : undefined;
    const results = await this.vectorStore.similaritySearch(query, 3, filter);
    return results.map((r) => `[${r.metadata.source}] ${r.pageContent}`);
  }
}