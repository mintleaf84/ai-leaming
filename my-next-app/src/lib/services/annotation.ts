import { drizzleDb } from "@/lib/db";
import { text_annotations } from "@/lib/db/drizzle-schema";
import { and, asc, eq } from "drizzle-orm";

/**
 * 文本批注（划线/下划线/波浪线）的数据访问。
 *
 * 从 `routes/annotations.ts` 下沉：路由只保留鉴权、参数校验与状态码。
 * 批注是**私有数据**，所有查询都必须带 `user_id`，否则就是 IDOR；
 * 把这层约束收在 service 里，路由想漏也漏不掉。
 */

export type AnnotationTag = "highlight" | "underline" | "wavy";

export interface AnnotationRow {
  id: number;
  startOffset: number;
  endOffset: number;
  tag: string;
  color: string | null;
  created_at: string | null;
}

export interface AnnotationInput {
  userId: number;
  questionId: number;
  startOffset: number;
  endOffset: number;
  tag: AnnotationTag;
  color?: string | null;
}

export const annotationService = {
  /** 某用户在指定题目上的批注，按起始偏移升序 */
  async list(userId: number, questionId: number): Promise<AnnotationRow[]> {
    return drizzleDb
      .select({
        id: text_annotations.id,
        startOffset: text_annotations.start_offset,
        endOffset: text_annotations.end_offset,
        tag: text_annotations.tag,
        color: text_annotations.color,
        created_at: text_annotations.created_at,
      })
      .from(text_annotations)
      .where(
        and(
          eq(text_annotations.user_id, userId),
          eq(text_annotations.question_id, questionId),
        ),
      )
      .orderBy(asc(text_annotations.start_offset));
  },

  /**
   * 写入批注（同用户 + 同题 + 同区间视为同一条，覆盖 tag/color）。
   * 冲突键包含 `user_id`：另一个用户在相同位置写批注只会新增自己那行。
   * 返回落库行的 id。
   */
  async upsert(input: AnnotationInput): Promise<number> {
    const { userId, questionId, startOffset, endOffset, tag, color } = input;

    const result = await drizzleDb
      .insert(text_annotations)
      .values({
        user_id: userId,
        question_id: questionId,
        start_offset: startOffset,
        end_offset: endOffset,
        tag,
        color: color || null,
      })
      .onConflictDoUpdate({
        target: [
          text_annotations.user_id,
          text_annotations.question_id,
          text_annotations.start_offset,
          text_annotations.end_offset,
        ],
        set: {
          tag,
          color: color || null,
        },
      });

    return Number(result.lastInsertRowid);
  },

  /** 删除批注；不属于该用户时同样返回 false（不区分"不存在"与"无权") */
  async remove(userId: number, id: number): Promise<boolean> {
    const result = await drizzleDb
      .delete(text_annotations)
      .where(
        and(eq(text_annotations.id, id), eq(text_annotations.user_id, userId)),
      );

    return result.rowsAffected !== 0;
  },
};
