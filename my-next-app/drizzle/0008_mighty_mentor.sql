CREATE TABLE `question_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`user_id` integer DEFAULT 1 NOT NULL,
	`feedback_type` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` integer,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_question_feedback_question` ON `question_feedback` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_question_feedback_user` ON `question_feedback` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_question_feedback_status` ON `question_feedback` (`status`);--> statement-breakpoint
CREATE INDEX `idx_question_feedback_created` ON `question_feedback` ("created_at" DESC);