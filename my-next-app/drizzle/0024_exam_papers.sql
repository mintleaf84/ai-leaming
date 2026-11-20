-- 试卷 / 模考（docs/exam-paper-plan.md §1）
--
-- 只加不改：
-- 1. 两张新表（试卷本体 + 有序题目）；
-- 2. practice_sessions 加四列（paper_id / deadline_at / exam_submitted_at /
--    exam_score）+ paper_id 索引。历史行（普通练习）四列全 NULL，语义不变。
--
-- 作答结果**不另建表**：一次作答 = 一条 practice_sessions（practice_mode='exam'）
-- + N 条 practice_logs（origin='exam'），错题本/历史/统计/掌握度因此自动生效。

CREATE TABLE `exam_papers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'fixed' NOT NULL,
	`duration_minutes` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`rules_json` text,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 试卷列表按 (user_id, created_at DESC) 取，列表还要聚合作答次数/最好成绩
CREATE INDEX `idx_exam_papers_user_created`
	ON `exam_papers` (`user_id`, `created_at` DESC);--> statement-breakpoint

CREATE TABLE `exam_paper_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`position` integer NOT NULL,
	UNIQUE(`paper_id`, `question_id`),
	UNIQUE(`paper_id`, `position`),
	FOREIGN KEY (`paper_id`) REFERENCES `exam_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

ALTER TABLE `practice_sessions` ADD `paper_id` integer REFERENCES exam_papers(id);--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `deadline_at` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `exam_submitted_at` text;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `exam_score` real;--> statement-breakpoint

-- 「有作答禁止删卷」检查与试卷列表聚合都按 paper_id 过滤
CREATE INDEX `idx_practice_sessions_paper`
	ON `practice_sessions` (`paper_id`);
