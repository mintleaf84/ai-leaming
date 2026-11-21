/**
 * `/api/external/notes`、`/api/external/mindmaps` 详情读的数据访问层。
 *
 * ## 为什么不复用 `knowledgeService.getNoteDetail` / `mindmapService.getDetail`
 *
 * 这两个方法都用 `throw new Error("...不存在")` 表达"不存在"，路由层要区分 404 与
 * 500 就只能去匹配错误文案 —— 文案一改，404 就静默变成 500（外部 API 里这是对外
 * 契约，不能靠字符串耦合）。本模块的两个查询是同一句 SQL 的**非抛出**变体：
 * 归属校验（`user_id`）条件、字段、`limit(1)` 全部与既有方法一致，只把"不存在"
 * 表达成 `null`。
 */

import { and, eq } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";

export type NoteRow = typeof drizzleSchema.notes.$inferSelect;
export type MindmapRow = typeof drizzleSchema.mindmaps.$inferSelect;

/** 读取属于该身份的笔记（不存在 / 不属于该身份一律 `null`） */
export async function findNoteForUser(
  userId: number,
  noteId: number,
): Promise<NoteRow | null> {
  const [note] = await drizzleDb
    .select()
    .from(drizzleSchema.notes)
    .where(
      and(
        eq(drizzleSchema.notes.id, noteId),
        eq(drizzleSchema.notes.user_id, userId),
      ),
    )
    .limit(1);

  return note ?? null;
}

/** 读取属于该身份的思维导图（不存在 / 不属于该身份一律 `null`） */
export async function findMindmapForUser(
  userId: number,
  mindmapId: number,
): Promise<MindmapRow | null> {
  const [row] = await drizzleDb
    .select()
    .from(drizzleSchema.mindmaps)
    .where(
      and(
        eq(drizzleSchema.mindmaps.id, mindmapId),
        eq(drizzleSchema.mindmaps.user_id, userId),
      ),
    )
    .limit(1);

  return row ?? null;
}
