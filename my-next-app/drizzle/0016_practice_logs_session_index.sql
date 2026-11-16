-- practice_logs(session_id) 索引（docs/performance.md X-2）
--
-- practice_logs 是全库最大的表，但四个既有索引（user_id+timestamp、is_correct、
-- question_id、user_id+is_correct）里没有 session_id。而它恰恰是"按会话取日志"
-- 的唯一过滤条件：
--   * 历史详情  src/lib/services/history.ts:243
--   * 学习报告  src/lib/services/report.ts:77/105/150/196
--   * 续做计数  src/lib/services/practice.ts:150
-- 每次打开历史详情或报告页都是全表扫，且扫描量与历史总量线性相关。
--
-- 只加索引，不改表结构，可重复执行。
CREATE INDEX IF NOT EXISTS `idx_practice_logs_session`
  ON `practice_logs` (`session_id`);
