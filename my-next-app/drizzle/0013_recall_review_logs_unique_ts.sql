-- 回忆自测 P2：作答日志的幂等唯一键
-- 手写迁移（与 0009–0012 同风格）：只 CREATE INDEX IF NOT EXISTS，可重复执行，
-- 不改任何既有表结构。
--
-- 为什么是唯一索引而不是"先查后写"：
--   * 提交接口的幂等键是 (user_id, card_id, ts 截到秒)。双击、"网络超时后重试"
--     都会在同一秒内打到同一张卡上；
--   * 只靠"先查后写"在并发下仍可能双写（查完到写之间有窗口），而日志是判分
--     质量统计与后续算法升级的唯一数据源，重复行会直接污染误杀率；
--   * 唯一索引把幂等交给数据库，服务层用 `onConflictDoNothing().returning()`
--     判断"是否本次真的写入了"，再决定要不要更新 recall_card_states。
--
-- 注意：已存在的重复行（理论上不会有，P1 没有任何写日志的代码）会让建索引失败；
-- 迁移失败会抛错阻止启动，这比静默丢数据好。
CREATE UNIQUE INDEX IF NOT EXISTS `recall_review_logs_user_card_ts_unique`
  ON `recall_review_logs` (`user_id`, `card_id`, `ts`);
