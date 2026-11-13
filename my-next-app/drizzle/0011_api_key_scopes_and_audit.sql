-- API Key 身份与作用域 + 写操作审计日志
-- 手写迁移（与 0009/0010 同样风格）：只用 ADD COLUMN / CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS，可重复执行，不重建任何既有表。
--
-- 说明：
--   * api_keys.user_id 为 NULL 表示"全局 key"，操作身份取 API_GLOBAL_USER_ID（默认 1），
--     语义等价于站长身份；非 NULL 表示绑定到该用户。
--   * scopes 为递进式作用域：admin ⊃ write ⊃ read。
--   * api_audit_logs.key_id / user_id 用 ON DELETE SET NULL：删 key 不抹掉历史痕迹。
ALTER TABLE `api_keys` ADD `user_id` integer REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `scopes` text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `last_used_at` text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`key_id` integer,
	`user_id` integer,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_api_audit_logs_created` ON `api_audit_logs` (`created_at` DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_api_audit_logs_key` ON `api_audit_logs` (`key_id`);
