/* 
Conflicts with legacy migrations.ts, handled there:
ALTER TABLE `questions` ADD `source` text;
ALTER TABLE `questions` ADD `correct_ratio` real;
ALTER TABLE `questions` ADD `most_wrong_answer` text;
ALTER TABLE `questions` ADD `material` text;
ALTER TABLE `questions` ADD `material_html` text;
ALTER TABLE `questions` ADD `external_id` text;
CREATE UNIQUE INDEX `questions_external_id_unique` ON `questions` (`external_id`);
*/