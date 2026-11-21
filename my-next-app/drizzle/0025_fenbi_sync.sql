-- 粉笔账号同步（docs/fenbi-sync-design.md §3）
--
-- 只加不改：两张新表。既有 practice_sessions / practice_logs 完全不动 ——
-- 同步的落库仍复用 importService.importFenbiData（source_key 幂等）。
--
-- 1. fenbi_accounts：绑定关系 + 加密后的密码/cookie；密钥缺失时两列为 NULL，
--    只允许扫码绑定。
-- 2. fenbi_synced_exercises：第三层去重（(user_id, exercise_id) 唯一），
--    增量同步命中即跳过，避免把历史重放一遍。

CREATE TABLE `fenbi_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`fenbi_user_id` text,
	`phone` text,
	`password_enc` text,
	`cookie_enc` text,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_sync_at` text,
	`last_sync_result` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 一个用户最多绑定一个粉笔账号：/fenbi/status 与 /fenbi/link 的 upsert 都按这列定位
CREATE UNIQUE INDEX `uq_fenbi_accounts_user`
	ON `fenbi_accounts` (`user_id`);--> statement-breakpoint

CREATE TABLE `fenbi_synced_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`source_key` text,
	`session_id` text,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP,
	`payload_sha256` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 增量同步的唯一查询条件就是 (user_id, exercise_id)：靠它做"命中即跳过"，
-- 同时兜住并发同步的重复写入。
CREATE UNIQUE INDEX `uq_fenbi_synced_exercises_user_exercise`
	ON `fenbi_synced_exercises` (`user_id`, `exercise_id`);
