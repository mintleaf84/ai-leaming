-- 题目内容级去重键（P1-1）。历史上只按 external_id 去重，外部 id 缺失/不同来源时
-- 同题干会被重复导入：线上库 2026-11-14 快照有 81 组重复、其中 30 组答案互相冲突
-- （兜底种子把多选答案截成首个选项）。
--
-- content_hash = sha256(normalize(content))：NFKC + 小写 + 去空白/标点/符号。
-- 存量行由 scripts/dedupe-fallback-questions.ts --apply 回填（导入侧对新题实时计算）。
ALTER TABLE `questions` ADD COLUMN `content_hash` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_questions_content_hash` ON `questions` (`content_hash`);
