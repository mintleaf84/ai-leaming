-- practice_logs 增加来源与作答状态（P0-2 / P0-3，见 docs/audit/2026-11-19-prod-db-2026-11-14-audit.md）
--
-- 背景（线上库 2026-11-14 快照）：
--   * 339 条日志没有 session_id、337 条 duration=0 —— 外部写入路径，无来源可辨；
--   * 348 条空答案日志全部 is_correct=0 并进入 SRS（「没做」被当成「做错」）；
--   * Agent API 的答题记录由调用方判定对错，服务端不复核，同样无标记。
--
-- 语义：
--   origin: web=用户练习（网页/移动端），agent=外部 Agent 导入，import=文件导入（粉笔/PDF）
--   status: answered=正常作答，skipped=未作答/空答案（不进 SRS），wrong_book=错题本收藏
ALTER TABLE `practice_logs` ADD COLUMN `origin` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_logs` ADD COLUMN `status` text DEFAULT 'answered' NOT NULL;--> statement-breakpoint
-- 历史回填：能确定的尽量确定，不能确定的一律保持 web/answered（不猜测）
UPDATE `practice_logs` SET `origin` = 'agent'
  WHERE `session_id` IS NULL
     OR `session_id` IN (SELECT `id` FROM `practice_sessions` WHERE `source_key` LIKE 'agent:%');--> statement-breakpoint
UPDATE `practice_logs` SET `origin` = 'import'
  WHERE `origin` = 'web'
    AND `session_id` IN (SELECT `id` FROM `practice_sessions` WHERE `practice_mode` = 'import');--> statement-breakpoint
UPDATE `practice_logs` SET `status` = 'skipped'
  WHERE `user_answer` IS NULL OR trim(`user_answer`) = '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_practice_logs_origin` ON `practice_logs` (`origin`);
