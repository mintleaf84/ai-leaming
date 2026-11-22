-- 教综知识图谱（docs/kg-product-plan.md §2）
--
-- 三张表：图结构（节点 / 边）+ 题→节点映射。图谱内容全局共享（无 user_id），
-- 只有 question_nodes 把题目挂到节点上；掌握度不新开表，按 node_key 聚合
-- practice_logs（见 docs/kg-product-plan.md §2 的取舍）。
--
-- 幂等键：
--   kg_nodes      UNIQUE(chapter, node_key)
--   kg_edges      UNIQUE(chapter, from_key, to_key, type)
--   question_nodes UNIQUE(question_id, node_key)
CREATE TABLE `kg_nodes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chapter` text NOT NULL,
  `node_key` text NOT NULL,
  `name` text NOT NULL,
  `kind` text DEFAULT 'concept' NOT NULL,
  `printed_page` integer,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kg_nodes_chapter_node_key_unique` ON `kg_nodes` (`chapter`,`node_key`);
--> statement-breakpoint
CREATE INDEX `idx_kg_nodes_chapter` ON `kg_nodes` (`chapter`);
--> statement-breakpoint
CREATE TABLE `kg_edges` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chapter` text NOT NULL,
  `from_key` text NOT NULL,
  `to_key` text NOT NULL,
  `type` text NOT NULL,
  `evidence` text NOT NULL,
  `printed_page` integer,
  `schema_version` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kg_edges_unique` ON `kg_edges` (`chapter`,`from_key`,`to_key`,`type`);
--> statement-breakpoint
CREATE INDEX `idx_kg_edges_chapter` ON `kg_edges` (`chapter`);
--> statement-breakpoint
CREATE INDEX `idx_kg_edges_from` ON `kg_edges` (`from_key`);
--> statement-breakpoint
CREATE TABLE `question_nodes` (
  `question_id` integer NOT NULL REFERENCES `questions`(`id`) ON DELETE cascade,
  `chapter` text NOT NULL,
  `node_key` text NOT NULL,
  `method` text,
  `score` integer,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_nodes_question_node_unique` ON `question_nodes` (`question_id`,`node_key`);
--> statement-breakpoint
CREATE INDEX `idx_question_nodes_chapter_node` ON `question_nodes` (`chapter`,`node_key`);
