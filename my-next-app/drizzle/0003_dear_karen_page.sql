CREATE TABLE IF NOT EXISTS `mindmaps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `note_tag_relations` (
	`note_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `note_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_note_tag_relations_note` ON `note_tag_relations` (`note_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_note_tag_relations_tag` ON `note_tag_relations` (`tag_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `note_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6b7280',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_note_tags_user` ON `note_tags` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `note_tags_user_id_name_unique` ON `note_tags` (`user_id`,`name`);--> statement-breakpoint
/* Conflicts with legacy migrations:
ALTER TABLE `practice_sessions` ADD `analysis_report` text;
*/