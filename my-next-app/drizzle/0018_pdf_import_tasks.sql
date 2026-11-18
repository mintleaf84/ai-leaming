CREATE TABLE `pdf_import_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`ocr_text` text NOT NULL,
	`chunks_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pdf_import_tasks_user` ON `pdf_import_tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_pdf_import_tasks_expires` ON `pdf_import_tasks` (`expires_at`);
