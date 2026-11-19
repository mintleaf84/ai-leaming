/**
 * 一次性清理：兜底题重复（P1-1 存量部分）。
 *
 * 线上库快照（2026-11-14）事实：
 *   - 84 条兜底题（type=NULL / source=NULL，2025-12-22 种子生成），其中 80 条能对应到
 *     一条真实题（30 multi + 50 single），题干与选项逐字相同；
 *   - 30 组「答案冲突」全部是兜底副本把多选答案截成了首个选项——不是命题争议；
 *   - 20 条兜底题被真实刷过（22 条日志 / 20 张 SRS），4 个用户在同题上「双卡」。
 *
 * 处理：
 *   1. 全库回填 content_hash（去重键）；
 *   2. 兜底题有真实副本 → 日志/反馈/文件夹迁到真实题，SRS 按「保留复习更充分的一张」
 *      合并，然后删除兜底题；
 *   3. 兜底题无副本（id 5–8）→ 标 source='fallback'，保留做题记录；
 *   4. 全程幂等：重复执行不会二次迁移/删除。
 *
 * dryRun=true 时只统计不写库（默认）。**生产执行前先备份**。
 */
import { drizzleDb } from "@/lib/db";
import {
  practice_logs,
  question_feedback,
  question_folder_items,
  question_srs,
  questions,
} from "@/lib/db/drizzle-schema";
import { contentHash } from "@/lib/services/question-dedup";
import { and, eq } from "drizzle-orm";

export interface DedupeCleanupReport {
  dryRun: boolean;
  hashesBackfilled: number;
  duplicateGroups: number;
  fallbackPairs: number;
  orphanFallbacks: number;
  logsMoved: number;
  srsMoved: number;
  srsMerged: number;
  feedbackMoved: number;
  folderItemsMoved: number;
  deletedQuestions: number;
  markedFallback: number;
  remainingDuplicateGroups: number;
}

interface Row {
  id: number;
  content: string;
  type: string | null;
  source: string | null;
  content_hash: string | null;
}

export async function dedupeFallbackQuestions(
  options: { dryRun?: boolean } = {},
): Promise<DedupeCleanupReport> {
  const dryRun = options.dryRun ?? true;

  const rows = (await drizzleDb
    .select({
      id: questions.id,
      content: questions.content,
      type: questions.type,
      source: questions.source,
      content_hash: questions.content_hash,
    })
    .from(questions)) as Row[];

  // 1. 回填 content_hash（只补空值，已有的不重算）
  let hashesBackfilled = 0;
  for (const row of rows) {
    if (row.content_hash) continue;
    const hash = contentHash(row.content ?? "");
    if (!hash) continue;
    hashesBackfilled += 1;
    row.content_hash = hash;
    if (!dryRun) {
      await drizzleDb
        .update(questions)
        .set({ content_hash: hash })
        .where(eq(questions.id, row.id));
    }
  }

  // 2. 按内容分组
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.content_hash) continue;
    const list = groups.get(row.content_hash) ?? [];
    list.push(row);
    groups.set(row.content_hash, list);
  }
  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1).length;

  const report: DedupeCleanupReport = {
    dryRun,
    hashesBackfilled,
    duplicateGroups,
    fallbackPairs: 0,
    orphanFallbacks: 0,
    logsMoved: 0,
    srsMoved: 0,
    srsMerged: 0,
    feedbackMoved: 0,
    folderItemsMoved: 0,
    deletedQuestions: 0,
    markedFallback: 0,
    remainingDuplicateGroups: 0,
  };

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const fallbacks = group.filter((r) => r.type === null);
    const canonicalRows = group.filter((r) => r.type !== null);
    if (fallbacks.length === 0 || canonicalRows.length === 0) continue;

    // 选日志最多的真实题作为保留行（并列取 id 较小者，保证确定性）
    const withCounts = await Promise.all(
      canonicalRows.map(async (r) => {
        const logs = await drizzleDb
          .select({ id: practice_logs.id })
          .from(practice_logs)
          .where(eq(practice_logs.question_id, r.id));
        return { row: r, logs: logs.length };
      }),
    );
    withCounts.sort((a, b) => b.logs - a.logs || a.row.id - b.row.id);
    const canonical = withCounts[0].row;

    for (const fb of fallbacks) {
      report.fallbackPairs += 1;

      const fbLogs = await drizzleDb
        .select({ id: practice_logs.id })
        .from(practice_logs)
        .where(eq(practice_logs.question_id, fb.id));
      report.logsMoved += fbLogs.length;
      if (!dryRun && fbLogs.length > 0) {
        await drizzleDb
          .update(practice_logs)
          .set({ question_id: canonical.id })
          .where(eq(practice_logs.question_id, fb.id));
      }

      // SRS：同用户双卡时保留复习更充分的一张（reps 多者；并列保留 last_review 晚者）
      const fbCards = await drizzleDb
        .select({
          id: question_srs.id,
          user_id: question_srs.user_id,
          reps: question_srs.reps,
          last_review: question_srs.last_review,
        })
        .from(question_srs)
        .where(eq(question_srs.question_id, fb.id));

      for (const card of fbCards) {
        const [existing] = await drizzleDb
          .select({
            id: question_srs.id,
            reps: question_srs.reps,
            last_review: question_srs.last_review,
          })
          .from(question_srs)
          .where(
            and(
              eq(question_srs.user_id, card.user_id),
              eq(question_srs.question_id, canonical.id),
            ),
          )
          .limit(1);

        if (!existing) {
          report.srsMoved += 1;
          if (!dryRun) {
            await drizzleDb
              .update(question_srs)
              .set({ question_id: canonical.id })
              .where(eq(question_srs.id, card.id));
          }
          continue;
        }

        // 双卡：保留复习更充分的那张
        const keepFallback =
          card.reps > existing.reps ||
          (card.reps === existing.reps &&
            (card.last_review ?? "") > (existing.last_review ?? ""));
        report.srsMerged += 1;
        if (!dryRun) {
          if (keepFallback) {
            await drizzleDb
              .delete(question_srs)
              .where(eq(question_srs.id, existing.id));
            await drizzleDb
              .update(question_srs)
              .set({ question_id: canonical.id })
              .where(eq(question_srs.id, card.id));
          } else {
            await drizzleDb
              .delete(question_srs)
              .where(eq(question_srs.id, card.id));
          }
        }
      }

      const fbs = await drizzleDb
        .select({ id: question_feedback.id })
        .from(question_feedback)
        .where(eq(question_feedback.question_id, fb.id));
      report.feedbackMoved += fbs.length;
      if (!dryRun && fbs.length > 0) {
        await drizzleDb
          .update(question_feedback)
          .set({ question_id: canonical.id })
          .where(eq(question_feedback.question_id, fb.id));
      }

      const fbItems = await drizzleDb
        .select({
          folder_id: question_folder_items.folder_id,
          question_id: question_folder_items.question_id,
        })
        .from(question_folder_items)
        .where(eq(question_folder_items.question_id, fb.id));
      for (const item of fbItems) {
        const [dup] = await drizzleDb
          .select({ question_id: question_folder_items.question_id })
          .from(question_folder_items)
          .where(
            and(
              eq(question_folder_items.folder_id, item.folder_id),
              eq(question_folder_items.question_id, canonical.id),
            ),
          )
          .limit(1);
        report.folderItemsMoved += 1;
        if (!dryRun) {
          if (dup) {
            await drizzleDb
              .delete(question_folder_items)
              .where(
                and(
                  eq(question_folder_items.folder_id, item.folder_id),
                  eq(question_folder_items.question_id, fb.id),
                ),
              );
          } else {
            await drizzleDb
              .update(question_folder_items)
              .set({ question_id: canonical.id })
              .where(
                and(
                  eq(question_folder_items.folder_id, item.folder_id),
                  eq(question_folder_items.question_id, fb.id),
                ),
              );
          }
        }
      }

      report.deletedQuestions += 1;
      if (!dryRun) {
        await drizzleDb.delete(questions).where(eq(questions.id, fb.id));
      }
    }
  }

  // 3. 无副本的兜底题：打 fallback 标记（保留做题记录）
  const remaining = (await drizzleDb
    .select({
      id: questions.id,
      content: questions.content,
      content_hash: questions.content_hash,
      type: questions.type,
      source: questions.source,
    })
    .from(questions)) as Row[];
  const byHash = new Map<string, Row[]>();
  const hashOf = (row: Row) =>
    row.content_hash ?? (row.content ? contentHash(row.content) : "");
  for (const row of remaining) {
    const h = hashOf(row);
    if (!h) continue;
    const list = byHash.get(h) ?? [];
    list.push(row);
    byHash.set(h, list);
  }
  for (const row of remaining) {
    if (row.type !== null) continue;
    const group = byHash.get(hashOf(row)) ?? [];
    if (group.some((r) => r.type !== null && r.id !== row.id)) continue; // 已作为重复删除
    report.orphanFallbacks += 1;
    if (row.source !== "fallback") {
      report.markedFallback += 1;
      if (!dryRun) {
        await drizzleDb
          .update(questions)
          .set({ source: "fallback" })
          .where(eq(questions.id, row.id));
      }
    }
  }

  // 4. 除兜底题外的重复组（同题干但都带 type）：本轮只报告，不自动合并
  const after = (await drizzleDb
    .select({
      id: questions.id,
      content: questions.content,
      content_hash: questions.content_hash,
      type: questions.type,
    })
    .from(questions)) as Row[];
  const afterGroups = new Map<string, Row[]>();
  for (const row of after) {
    const h = hashOf(row);
    if (!h) continue;
    const list = afterGroups.get(h) ?? [];
    list.push(row);
    afterGroups.set(h, list);
  }
  report.remainingDuplicateGroups = [...afterGroups.values()].filter(
    (g) => g.length > 1,
  ).length;

  return report;
}
