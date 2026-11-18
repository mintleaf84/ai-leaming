/**
 * 题目「哪些字段变更会影响向量索引」的唯一判定。
 *
 * 抽取原因：后台改题（admin-service）与外部 API 改题（routes/external）都要判断
 * "这次改动要不要重建 embedding"。两处各写一遍，迟早一边忘了答案变化也要重建，
 * 结果就是检索按旧答案召回。
 */

/** 参与 embedding 文本拼接的字段（改动任一都需要重建向量） */
const EMBEDDING_TEXT_FIELDS = ["content", "options", "answer"] as const;

export function touchesEmbeddingText(data: Record<string, unknown>): boolean {
  return EMBEDDING_TEXT_FIELDS.some((field) => data[field] !== undefined);
}
