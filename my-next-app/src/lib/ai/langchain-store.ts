import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { ragService } from "./rag";

/**
 * 适配现有 sqlite-vec 的 LangChain 向量存储
 * 不继承 VectorStore 基类，直接实现核心方法
 */
export class SqliteVecVectorStore {
  filter?: { sourceType?: string };
  embeddings: RagEmbeddings;

  constructor(embeddings: RagEmbeddings, filter?: { sourceType?: string }) {
    this.embeddings = embeddings;
    this.filter = filter;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const vectors = await this.embeddings.embedDocuments(
      documents.map((doc) => doc.pageContent),
    );
    for (let i = 0; i < vectors.length; i++) {
      await ragService.addChunk(
        documents[i].pageContent,
        documents[i].metadata,
      );
    }
  }

  async similaritySearch(query: string, k: number): Promise<Document[]> {
    const results = await ragService.search(query, k, this.filter?.sourceType);
    return results.map(
      (r) =>
        new Document({
          pageContent: r.content,
          metadata: r.metadata || {},
        }),
    );
  }

  async similaritySearchWithScore(
    query: string,
    k: number,
  ): Promise<[Document, number][]> {
    const results = await ragService.search(query, k, this.filter?.sourceType);
    return results.map((r) => [
      new Document({
        pageContent: r.content,
        metadata: r.metadata || {},
      }),
      1 - r.score,
    ]);
  }

  static async fromExistingIndex(
    embeddings: RagEmbeddings,
    filter?: { sourceType?: string },
  ): Promise<SqliteVecVectorStore> {
    return new SqliteVecVectorStore(embeddings, filter);
  }

  static async fromTexts(
    texts: string[],
    metadatas: Record<string, unknown>[],
    embeddings: RagEmbeddings,
  ): Promise<SqliteVecVectorStore> {
    const docs = texts.map(
      (text, i) =>
        new Document({ pageContent: text, metadata: metadatas[i] || {} }),
    );
    const store = new SqliteVecVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
  }
}

/**
 * 复用现有 ragService 的 embedding 获取逻辑
 */
export class RagEmbeddings extends Embeddings {
  async embedDocuments(documents: string[]): Promise<number[][]> {
    return Promise.all(documents.map((doc) => this.embedQuery(doc)));
  }

  async embedQuery(document: string): Promise<number[]> {
    return ragService.getEmbedding(document);
  }
}

/**
 * 创建 LangChain 向量存储
 */
export async function createVectorStore(
  sourceType?: string,
): Promise<SqliteVecVectorStore> {
  const embeddings = new RagEmbeddings({});
  const filter = sourceType ? { sourceType } : undefined;
  return SqliteVecVectorStore.fromExistingIndex(embeddings, filter);
}

/**
 * 为题目创建向量存储
 */
export async function createQuestionVectorStore(): Promise<SqliteVecVectorStore> {
  return createVectorStore("question");
}

/**
 * 为知识卡片创建向量存储
 */
export async function createCardVectorStore(): Promise<SqliteVecVectorStore> {
  return createVectorStore("card");
}

/**
 * 为教材章节创建向量存储
 */
export async function createTextbookVectorStore(): Promise<SqliteVecVectorStore> {
  return createVectorStore("textbook_chapter");
}
