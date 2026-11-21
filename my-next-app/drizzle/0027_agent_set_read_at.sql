-- Agent 题集：已读时间（docs/agent-question-set-plan.md §4.3 Web lane 冻结）
--
-- 契约：`GET /api/agent-sets/{id}` 视为「打开即已读」——响应返回后该 set 的
-- unreadCount 归零（幂等写，不加独立 read 端点）；列表接口只读。
--
-- 只存"首次打开时间"而不是布尔：将来要算"多久没看"不用再改表。
-- NULL = 从未打开过（unreadCount = questionCount）。
ALTER TABLE `agent_question_sets` ADD `read_at` text;
