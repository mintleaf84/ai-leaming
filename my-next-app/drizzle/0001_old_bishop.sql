CREATE TABLE IF NOT EXISTS `ai_challenge_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_quiz_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `first_principles_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_hash` text NOT NULL,
	`analysis` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `first_principles_cache_question_hash_unique` ON `first_principles_cache` (`question_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fp_cache_hash` ON `first_principles_cache` (`question_hash`);