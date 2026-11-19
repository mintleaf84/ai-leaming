-- 读路径索引补齐（docs/perf-measure.md / 服务端性能 S1）
--
-- 只加索引，不改表结构，可重复执行。四张表此前**零索引**，对应查询在临时库上
-- 实测为 `SCAN <表>`（`EXPLAIN QUERY PLAN`，见 docs/perf-measure.md 的对照表）：
--   * session_reviews(session_id)     会话详情左连接、删会话前的清理
--                                     src/lib/services/history.ts:243/299
--   * textbook_chapters(textbook_id, order_index)
--                                     章节列表 src/lib/services/textbook.ts:157
--   * notes(user_id, updated_at DESC) 笔记列表 src/lib/services/knowledge.ts:423
--   * knowledge_cards(user_id, created_at DESC)
--                                     卡片列表 src/lib/services/knowledge.ts:116
--                                     （原单列 idx_user 命中过滤但排序仍走临时 B 树）
--
-- practice_logs(question_id, user_id, is_correct) 经实测**不需要**：错题统计那条
-- 查询已命中 idx_practice_logs_user_correct(user_id, is_correct)，再建一个是重复索引。

CREATE INDEX IF NOT EXISTS `idx_session_reviews_session`
  ON `session_reviews` (`session_id`);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `idx_textbook_chapters_textbook`
  ON `textbook_chapters` (`textbook_id`, `order_index`);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `idx_notes_user_updated`
  ON `notes` (`user_id`, `updated_at` DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `idx_knowledge_cards_user_created`
  ON `knowledge_cards` (`user_id`, `created_at` DESC);
