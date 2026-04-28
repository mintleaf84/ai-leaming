CREATE INDEX `idx_admin_logs_created` ON `admin_logs` ("created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_admin_logs_user` ON `admin_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_logs_action` ON `admin_logs` (`action`);--> statement-breakpoint
CREATE INDEX `idx_api_logs_created` ON `api_call_logs` ("created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_api_logs_user_created` ON `api_call_logs` (`user_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_api_logs_model` ON `api_call_logs` (`model`);--> statement-breakpoint
CREATE INDEX `idx_api_logs_date` ON `api_call_logs` (date("created_at"));--> statement-breakpoint
CREATE INDEX `idx_chat_messages_session` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_updated` ON `chat_sessions` ("updated_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_user` ON `chat_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_usage_user_date` ON `daily_usage` (`user_id`,`usage_date`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_cards_category` ON `knowledge_cards` (`category`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_cards_created` ON `knowledge_cards` ("created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_knowledge_cards_user` ON `knowledge_cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_mastered_questions_user` ON `mastered_questions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_mastered_questions_user_q` ON `mastered_questions` (`user_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_records_user` ON `payment_records` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_records_order` ON `payment_records` (`order_no`);--> statement-breakpoint
CREATE INDEX `idx_practice_logs_user_ts` ON `practice_logs` (`user_id`,"timestamp" DESC);--> statement-breakpoint
CREATE INDEX `idx_practice_logs_correct` ON `practice_logs` (`is_correct`);--> statement-breakpoint
CREATE INDEX `idx_practice_logs_question` ON `practice_logs` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_practice_logs_user_correct` ON `practice_logs` (`user_id`,`is_correct`);--> statement-breakpoint
CREATE INDEX `idx_practice_sessions_user_ts` ON `practice_sessions` (`user_id`,"created_at" DESC);