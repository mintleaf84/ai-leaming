-- 前端 Web Vitals 采样表（docs/performance.md T-01）
--
-- 手写迁移（与 0009–0014 同风格）：只建表 + 建索引，IF NOT EXISTS 可重复执行。
--
-- 为什么要落库而不是接第三方分析：
--   * INP 是"点击不跟手"的唯一官方指标（2024-03 起取代 FID）。没有它，
--     所谓"优化是否有效"只能靠体感，而体感无法比较两次改动的差异；
--   * 单用户自部署场景数据量小（每天百行级），本地存一份就够，不需要采样、
--     不需要外部依赖，也不需要考虑隐私出境；
--   * route + name + created_at 三列覆盖唯一查询形态：
--     「某路由某指标的最近 N 个点」以及 p75 的分组统计。
--
-- value 用整数存毫秒（CLS 无量纲，放大 1000 倍后取整），避免浮点比较误差。
CREATE TABLE IF NOT EXISTS `web_vitals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `route` text NOT NULL,
  `name` text NOT NULL,
  `value` integer NOT NULL,
  `rating` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_web_vitals_route_name`
  ON `web_vitals` (`route`, `name`, `created_at` DESC);
