-- 回忆自测（Recall Self-Test）数据层
-- 手写迁移（与 0009/0010/0011 同样风格）：只用 CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS，可重复执行，不重建任何既有表。
--
-- 说明：
--   * 卡组与卡片内容是**全局共享**的（内容与源码解耦，靠卡组文件导入），因此
--     recall_decks / recall_cards 不带 user_id；复习状态与日志**按用户隔离**。
--   * recall_decks.owner_user_id 可空：NULL = 公共卡组（任何用户都可导入更新），
--     非 NULL = 该用户维护的卡组。
--   * recall_decks.groups_json 存规格 §1.1 的 groups 树（P1 不单独建表），
--     否则 import→export 会丢分组标题与顺序，导出就不再与导入同格式。
--   * recall_card_states.pending_items 存上次判错的条目序号，重测只呈现这些条目。
--   * recall_review_logs.keyword_hits / keyword_total 为 P1 预留字段（匹配器误杀率
--     与未来"按条目加权判分"的数据基础），P1 只写不读。
CREATE TABLE IF NOT EXISTS `recall_decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`deck_key` text NOT NULL,
	`title` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`groups_json` text,
	`owner_user_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `recall_decks_deck_key_unique` ON `recall_decks` (`deck_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recall_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`deck_id` integer NOT NULL,
	`card_key` text NOT NULL,
	`kind` text NOT NULL,
	`group_key` text,
	`prompt` text NOT NULL,
	`items_json` text,
	`blanks_json` text,
	`verbatim` integer DEFAULT 0 NOT NULL,
	`prompt_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`deck_id`) REFERENCES `recall_decks`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `recall_cards_deck_id_card_key_unique` ON `recall_cards` (`deck_id`,`card_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recall_cards_deck` ON `recall_cards` (`deck_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recall_card_states` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`due` text,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review` text,
	`pending_items` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `recall_cards`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `recall_card_states_user_id_card_id_unique` ON `recall_card_states` (`user_id`,`card_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recall_card_states_user_due` ON `recall_card_states` (`user_id`,`due`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recall_review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`ts` text NOT NULL,
	`mode` text NOT NULL,
	`algo_verdicts` text,
	`user_overrides` text,
	`keyword_hits` integer,
	`keyword_total` integer,
	`derived_rating` text,
	`typed_answer` text,
	`fsrs_before` text,
	`fsrs_after` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `recall_cards`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recall_review_logs_user_ts` ON `recall_review_logs` (`user_id`,`ts` DESC);
