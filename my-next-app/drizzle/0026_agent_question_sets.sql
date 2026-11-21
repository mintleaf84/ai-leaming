-- Agent 推题 / 题集（docs/agent-question-set-plan.md §2–§3）
--
-- 只加不改：
-- 1. 新表 `agent_question_sets`：一次推送 = 一批，`(user_id, batch_key)` 幂等；
-- 2. `questions` 加 `origin` / `agent_set_id` / `agent_position` /
--    `agent_flag_reason` 四列，并给 `origin` 建索引（三处隔离过滤都按它）；
-- 3. `practice_sessions` 加 `agent_set_id`（`practice_mode='agent_set'` 的作答）。
--
-- 为什么打在 `questions` 上而不是另建题目表：`practice_logs.question_id` 是
-- `questions(id)` 的外键，错题本 / 掌握度 / 历史 / 统计全都基于它。另建一张表
-- 意味着 Agent 题永远进不了错题本（§2 的结构性取舍）。
--
-- `origin` 默认 `'import'`：历史行与既有写入路径（导入、建题、草稿 confirm）
-- 不传该列，落库即正常题库题，语义零变化。
--   import  = 正常题库题（进题库列表 / 自动组卷 / 掌握度）
--   agent   = Agent 题集里的题（上述三处过滤掉，但可进错题本与历史）
--   flagged = 用户报「这题有问题」后移出的题（消费侧查询一律过滤）

CREATE TABLE `agent_question_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`batch_key` text NOT NULL,
	`title` text NOT NULL,
	`agent` text,
	`model` text,
	`prompt_version` text,
	`target_tags` text,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 幂等键：同一用户同一 batchKey 只允许一批（重推返回既有批次）
CREATE UNIQUE INDEX `agent_question_sets_user_batch_unique`
	ON `agent_question_sets` (`user_id`, `batch_key`);--> statement-breakpoint

-- 列表按 (user_id, created_at DESC) 取
CREATE INDEX `idx_agent_question_sets_user_created`
	ON `agent_question_sets` (`user_id`, `created_at` DESC);--> statement-breakpoint

ALTER TABLE `questions` ADD `origin` text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `agent_set_id` integer REFERENCES agent_question_sets(id);--> statement-breakpoint
ALTER TABLE `questions` ADD `agent_position` integer;--> statement-breakpoint
-- 报错理由：§3 的列清单里没有它，但 §4.1/§4.2 要求把 `flagReason` 回传给 agent，
-- 必须有落库位置，否则「记录理由」只存在于响应里（重启即丢）
ALTER TABLE `questions` ADD `agent_flag_reason` text;--> statement-breakpoint

-- 题库列表 / 自动组卷 / 掌握度三处过滤 + promote（origin 转正）都按 origin 过滤
CREATE INDEX `idx_questions_origin` ON `questions` (`origin`);--> statement-breakpoint

-- `practice_mode='agent_set'` 的作答会话指向题集；普通练习/试卷该列为 NULL
ALTER TABLE `practice_sessions` ADD `agent_set_id` integer;--> statement-breakpoint

-- 题集作答结果按 agent_set_id 反查（getResults 的日志过滤条件）
CREATE INDEX `idx_practice_sessions_agent_set`
	ON `practice_sessions` (`agent_set_id`);
