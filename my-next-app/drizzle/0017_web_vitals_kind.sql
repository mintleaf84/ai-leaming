-- Web Vitals 表扩展：区分「页面加载指标」与「启动/导航耗时」（docs/performance.md P2-02）
--
-- 手写迁移（与 0009–0016 同风格）：只 ADD COLUMN + 建索引，可重复执行。
--
-- 为什么复用同一张表而不是新建：
--   * 三类数据要按路由一起看（"这页 INP 高"与"这页启动慢"经常同时出现），
--     分表会让每次归因都要 join；
--   * 写入路径只有 /api/vitals 一处，加一列比加一张表少一半代码。
--
-- kind 取值：
--   vital  — INP / LCP / CLS / TTFB / FCP（现有数据全部落到这里，default 保证兼容）
--   launch — 首屏可交互时间（domInteractive - startTime）
--   nav    — 单次交互的「按下 → 下一帧」（Event Timing duration）
--
-- value 一律毫秒整数；CLS 仍然放大 1000 后取整。
-- from_route 只对 kind=nav 有意义：记录「从哪一页点的」，否则只能知道落在哪一页。
ALTER TABLE `web_vitals` ADD COLUMN `kind` text DEFAULT 'vital';--> statement-breakpoint
ALTER TABLE `web_vitals` ADD COLUMN `from_route` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_web_vitals_kind`
  ON `web_vitals` (`route`, `kind`, `created_at` DESC);
