-- 修复 question_srs.id 的 NOT NULL 与 drizzle 自增插入的冲突。
-- drizzle 0.45 对自增主键会显式写入 NULL（`values (null, ...)`），SQLite 依赖
-- 「INTEGER PRIMARY KEY 为 NULL 时自动分配 rowid」的语义；但 0004 建表时带了
-- NOT NULL，导致每次 upsert 都报 NOT NULL constraint failed，且错误被
-- syncFromPracticeLogs 的逐题 try/catch 吞掉，SRS 同步长期静默失效。
-- SQLite 不支持 ALTER COLUMN，故按官方建议重建表。
CREATE TABLE `question_srs_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` text,
	`due_date` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `question_srs_new` (
	`id`, `user_id`, `question_id`, `stability`, `difficulty`,
	`elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`,
	`last_review`, `due_date`
)
SELECT
	`id`, `user_id`, `question_id`, `stability`, `difficulty`,
	`elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`,
	`last_review`, `due_date`
FROM `question_srs`;
--> statement-breakpoint
DROP TABLE `question_srs`;
--> statement-breakpoint
ALTER TABLE `question_srs_new` RENAME TO `question_srs`;
--> statement-breakpoint
CREATE INDEX `idx_question_srs_due` ON `question_srs` (`due_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_srs_user_id_question_id_unique` ON `question_srs` (`user_id`,`question_id`);
