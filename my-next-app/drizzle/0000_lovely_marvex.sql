CREATE TABLE IF NOT EXISTS `admin_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`username` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`details` text,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`api_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model_economy` text,
	`model_premium` text,
	`model_embedding` text,
	`embedding_dimensions` integer,
	`model_rerank` text,
	`model_knowledge` text,
	`is_active` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_model_routes` (
	`feature` text PRIMARY KEY NOT NULL,
	`config_id` integer,
	`model_name` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`config_id`) REFERENCES `ai_configs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_call_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`config_id` integer,
	`model` text NOT NULL,
	`endpoint` text,
	`input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`duration_ms` integer,
	`success` integer DEFAULT 1,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key_string` text NOT NULL,
	`description` text DEFAULT '',
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `api_keys_key_string_unique` ON `api_keys` (`key_string`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`is_favorite` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`message_count` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`usage_date` text NOT NULL,
	`usage_type` text NOT NULL,
	`count` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `daily_usage_user_id_usage_date_usage_type_unique` ON `daily_usage` (`user_id`,`usage_date`,`usage_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `knowledge_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`session_id` integer,
	`title` text NOT NULL,
	`category` text,
	`tags` text,
	`front` text,
	`back` text,
	`key_points` text,
	`source_content` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mastered_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`mastered_at` text DEFAULT CURRENT_TIMESTAMP,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mastered_questions_user_id_question_id_unique` ON `mastered_questions` (`user_id`,`question_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `observation_zone` (
	`user_id` integer DEFAULT 1 NOT NULL,
	`tag_name` text NOT NULL,
	`reason` text,
	`entered_at` text DEFAULT CURRENT_TIMESTAMP,
	`status` text DEFAULT 'active',
	PRIMARY KEY(`user_id`, `tag_name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payment_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`order_no` text NOT NULL,
	`payment_no` text,
	`plan_id` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`paid_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payment_records_order_no_unique` ON `payment_records` (`order_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `practice_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`user_id` integer DEFAULT 1 NOT NULL,
	`question_id` integer NOT NULL,
	`user_answer` text,
	`is_correct` integer NOT NULL,
	`is_monitored_correct` integer DEFAULT false,
	`duration_ms` integer,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`session_name` text,
	`total_questions` integer DEFAULT 0,
	`correct_count` integer DEFAULT 0,
	`review_count` integer DEFAULT 0,
	`questions_json` text,
	`practice_mode` text,
	`is_demo` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `prompt_templates` (
	`key` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`description` text,
	`variables` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`options` text,
	`answer` text,
	`explanation` text,
	`tags` text,
	`dimension` text,
	`type` text,
	`ai_mnemonic` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`question_id` integer NOT NULL,
	`review_data` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subscription_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tier` text NOT NULL,
	`price_monthly` integer DEFAULT 0,
	`limits` text NOT NULL,
	`features` text,
	`is_active` integer DEFAULT 1,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `system_settings` (
	`user_id` integer DEFAULT 1 NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `text_annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`tag` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_text_annotations_user_question` ON `text_annotations` (`user_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `text_annotations_user_id_question_id_start_offset_end_offset_unique` ON `text_annotations` (`user_id`,`question_id`,`start_offset`,`end_offset`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `textbook_chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`textbook_id` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`order_index` integer DEFAULT 0,
	`parent_id` integer,
	`level` integer DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`textbook_id`) REFERENCES `textbooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `textbooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`description` text,
	`cover_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_mastery` (
	`user_id` integer DEFAULT 1 NOT NULL,
	`tag_name` text NOT NULL,
	`score` real DEFAULT 0,
	`correct_count` integer DEFAULT 0,
	`total_count` integer DEFAULT 0,
	`history` text,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`user_id`, `tag_name`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`plan_id` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active',
	`started_at` text DEFAULT CURRENT_TIMESTAMP,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_subscriptions_user_id_unique` ON `user_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'student',
	`token_version` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);