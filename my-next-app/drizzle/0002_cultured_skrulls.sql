/* 
Conflicts with legacy migrations.ts, handled there:
ALTER TABLE `questions` ADD `source` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `correct_ratio` real;--> statement-breakpoint
ALTER TABLE `questions` ADD `most_wrong_answer` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `material` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `material_html` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `questions_external_id_unique` ON `questions` (`external_id`);
*/