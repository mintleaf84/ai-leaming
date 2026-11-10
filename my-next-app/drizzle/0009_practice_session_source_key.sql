ALTER TABLE `practice_sessions` ADD `source_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_practice_sessions_user_source` ON `practice_sessions` (`user_id`,`source_key`);
