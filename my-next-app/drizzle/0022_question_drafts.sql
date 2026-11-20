-- AI 草稿校对流（docs/flutter-mobile-plan.md §34）
--
-- 为什么放服务端而不是移动端本地：AI key 只在服务端，且"哪版 prompt + 哪个模型
-- 产出的草稿"必须可查（ai_prompt_version / ai_provider / ai_model / ai_raw_json）。
-- 草稿是**中间态**，过期由 expires_at 清理；items 随草稿级联删除。

CREATE TABLE `question_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`image_sha256` text,
	`image_rel_path` text,
	`ai_provider` text,
	`ai_model` text,
	`ai_prompt_version` text,
	`ai_raw_json` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE `question_draft_items` (
	`draft_id` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text,
	`options` text,
	`answer` text,
	`explanation` text,
	`tags` text,
	`type` text,
	`material_html` text,
	`confirmed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`draft_id`, `idx`),
	FOREIGN KEY (`draft_id`) REFERENCES `question_drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 列表/归属查询按 user_id 过滤，再按创建时间倒序（草稿箱）
CREATE INDEX `idx_question_drafts_user_created`
	ON `question_drafts` (`user_id`, `created_at` DESC);--> statement-breakpoint

-- 过期清理只扫 expires_at
CREATE INDEX `idx_question_drafts_expires`
	ON `question_drafts` (`expires_at`);
