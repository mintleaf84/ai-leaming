-- 说明（2026-11-11 更正）：
--   本次重建对**行为没有影响**。SQLite 的 INTEGER PRIMARY KEY 是 rowid 别名，
--   即使声明了 NOT NULL，显式写入 NULL 也会自动分配 rowid（已实测）。
--   早先「SRS 同步失败是因为 id NOT NULL」的结论是错的：真正原因是事务内
--   通过全局 drizzleDb 执行语句（见 srs.ts 的 exec 执行器修复），
--   逐题失败被 catch 吞掉后，事务提交再报 SQLITE_BUSY 并整批回滚。
--   保留此迁移只为资产一致（排查过程中已合入 main），不改变任何数据语义。
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
