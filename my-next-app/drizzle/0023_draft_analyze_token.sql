-- 并发识别令牌（docs/flutter-mobile-plan.md §34 评审修复）
--
-- 两个 analyze 并发时都能把 status 改成 analyzing，只靠状态无法分辨"库里那一次
-- 是谁发起的"。每次识别写自己的 token，结果落地前在同一事务内校验
-- `status = 'analyzing' AND analyze_token = 本次 token`，不匹配即丢弃结果 ——
-- 旧结果不会覆盖新结果，也不会把 confirm/discard 改回 ready。
ALTER TABLE `question_drafts` ADD `analyze_token` text;
