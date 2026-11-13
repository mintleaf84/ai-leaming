-- 回忆自测 P3：跨秒重试的幂等键
--
-- 0013 的 `(user_id, card_id, ts 截到秒)` 只能挡住"同一秒"的重复提交；用户点一次
-- 提交、网络超时、过了两秒再点一次，会写成两条日志，并把 FSRS 调度推进两次
-- （pendingItems 与 due 一起漂移）。秒级时间戳不是真正的幂等键。
--
-- 客户端在**进入判分屏时**生成一个 `crypto.randomUUID()`，失败重试沿用同一个 key，
-- 提交成功后才丢弃。服务端先按 `(user_id, client_key)` 查日志：命中就当作重放，
-- 直接返回那一次的结果，不再写日志、不再推进调度。
--
-- client_key 允许 NULL：迁移前的历史行、以及没有传 key 的调用方（旧客户端、
-- 补录脚本）都落在 NULL 上。SQLite 的唯一索引把多个 NULL 视作互不相同，
-- 因此这些行不会被这把索引挡住。
ALTER TABLE `recall_review_logs` ADD COLUMN `client_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `recall_review_logs_user_client_key_unique`
  ON `recall_review_logs` (`user_id`, `client_key`);
