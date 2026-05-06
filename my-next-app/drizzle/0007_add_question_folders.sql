CREATE TABLE IF NOT EXISTS `question_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`color` text DEFAULT '#6b7280',
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_question_folders_user` ON `question_folders` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `question_folder_items` (
	`folder_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`folder_id`, `question_id`),
	FOREIGN KEY (`folder_id`) REFERENCES `question_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_folder_items_folder` ON `question_folder_items` (`folder_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_folder_items_question` ON `question_folder_items` (`question_id`);
