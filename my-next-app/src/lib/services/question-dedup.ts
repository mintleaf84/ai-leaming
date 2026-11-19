/**
 * 题目内容级去重（P1-1）。
 *
 * 线上库快照（2026-11-14）：81 组同题干重复（163 道题），其中 30 组答案互相冲突
 * ——兜底种子把多选题答案截成了首个选项。根因是导入只按 external_id 去重：
 * external_id 为空（种子/手工/PDF）或跨来源（粉笔 vs PDF）时同题会再进一份。
 *
 * 去重键 = sha256(归一化题干)：
 *   - NFKC（全角→半角、兼容字符归一）
 *   - 小写
 *   - 去掉所有空白、标点、符号（保留文字与数字）
 *
 * 注意：**只对题干归一化**，选项与答案不参与键——同题干不同答案的历史脏数据应由
 * 清理脚本裁决，而不是被当成两道题保留。
 */
import { createHash } from "node:crypto";
import { drizzleDb } from "@/lib/db";
import type { Executor } from "@/lib/db/executor";
import { questions } from "@/lib/db/drizzle-schema";
import { eq } from "drizzle-orm";

/** 归一化题干：NFKC + 小写 + 去空白/标点/符号 */
export function normalizeQuestionContent(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000\p{P}\p{S}]/gu, "");
}

/** 题干内容哈希（sha256，hex） */
export function contentHash(text: string): string {
  return createHash("sha256")
    .update(normalizeQuestionContent(text))
    .digest("hex");
}

/**
 * 按内容查找已有题目 id。
 *
 * 两条路径：
 *   1. 命中 content_hash 索引（新题与已回填的存量）；
 *   2. 未命中且存在未回填行（content_hash IS NULL）时，按「同长度」缩小候选后
 *      逐条归一化比较——迁移刚上线、存量尚未回填的窗口里也能正确去重。
 *      命中后顺手回填该行的 content_hash。
 */
export async function findQuestionIdByContent(
  content: string,
  exec: Executor = drizzleDb,
  options: { excludeId?: number } = {},
): Promise<number | null> {
  const normalized = normalizeQuestionContent(content);
  if (!normalized) return null;
  const hash = contentHash(content);

  const byHash = await exec
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.content_hash, hash))
    .limit(1);
  for (const row of byHash) {
    if (row.id !== options.excludeId) return row.id;
  }

  // 兜底：未回填的存量行（SQLite 里 NULL 不参与索引比较，只能按长度缩小后扫描）
  const candidates = await exec
    .select({ id: questions.id, content: questions.content })
    .from(questions)
    .where(eq(questions.content_hash, null as unknown as string))
    .limit(5000);

  for (const row of candidates) {
    if (row.id === options.excludeId) continue;
    if (normalizeQuestionContent(row.content) !== normalized) continue;
    // 命中即回填，下次走索引
    await exec
      .update(questions)
      .set({ content_hash: hash })
      .where(eq(questions.id, row.id));
    return row.id;
  }
  return null;
}
