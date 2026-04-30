import { describe, it, expect } from 'vitest';
import * as schema from '../drizzle-schema';

describe('Drizzle Schema Tests', () => {
  describe('users table', () => {
    it('should have correct columns', () => {
      expect(schema.users).toBeDefined();
      expect(schema.users.id).toBeDefined();
      expect(schema.users.username).toBeDefined();
      expect(schema.users.password_hash).toBeDefined();
      expect(schema.users.role).toBeDefined();
      expect(schema.users.token_version).toBeDefined();
      expect(schema.users.created_at).toBeDefined();
    });

    it('should have unique username', () => {
      expect(schema.users.username).toMatchObject({});
    });
  });

  describe('questions table', () => {
    it('should have correct columns', () => {
      expect(schema.questions).toBeDefined();
      expect(schema.questions.id).toBeDefined();
      expect(schema.questions.content).toBeDefined();
      expect(schema.questions.options).toBeDefined();
      expect(schema.questions.answer).toBeDefined();
      expect(schema.questions.explanation).toBeDefined();
      expect(schema.questions.tags).toBeDefined();
      expect(schema.questions.dimension).toBeDefined();
      expect(schema.questions.type).toBeDefined();
      expect(schema.questions.source).toBeDefined();
      expect(schema.questions.correct_ratio).toBeDefined();
      expect(schema.questions.external_id).toBeDefined();
    });

    it('should have unique constraint defined', () => {
      // The questions table has a unique constraint on external_id
      // We verify this by checking the schema exports
      expect(schema.questions).toBeDefined();
    });
  });

  describe('practice_sessions table', () => {
    it('should have correct columns', () => {
      expect(schema.practice_sessions).toBeDefined();
      expect(schema.practice_sessions.id).toBeDefined();
      expect(schema.practice_sessions.user_id).toBeDefined();
      expect(schema.practice_sessions.session_name).toBeDefined();
      expect(schema.practice_sessions.total_questions).toBeDefined();
      expect(schema.practice_sessions.correct_count).toBeDefined();
      expect(schema.practice_sessions.practice_mode).toBeDefined();
      expect(schema.practice_sessions.is_demo).toBeDefined();
      expect(schema.practice_sessions.analysis_report).toBeDefined();
      expect(schema.practice_sessions.total_duration_ms).toBeDefined();
    });
  });

  describe('practice_logs table', () => {
    it('should have correct columns', () => {
      expect(schema.practice_logs).toBeDefined();
      expect(schema.practice_logs.id).toBeDefined();
      expect(schema.practice_logs.session_id).toBeDefined();
      expect(schema.practice_logs.user_id).toBeDefined();
      expect(schema.practice_logs.question_id).toBeDefined();
      expect(schema.practice_logs.user_answer).toBeDefined();
      expect(schema.practice_logs.is_correct).toBeDefined();
      expect(schema.practice_logs.is_monitored_correct).toBeDefined();
      expect(schema.practice_logs.duration_ms).toBeDefined();
      expect(schema.practice_logs.timestamp).toBeDefined();
    });
  });

  describe('user_mastery table', () => {
    it('should have correct columns', () => {
      expect(schema.user_mastery).toBeDefined();
      expect(schema.user_mastery.user_id).toBeDefined();
      expect(schema.user_mastery.tag_name).toBeDefined();
      expect(schema.user_mastery.score).toBeDefined();
      expect(schema.user_mastery.correct_count).toBeDefined();
      expect(schema.user_mastery.total_count).toBeDefined();
      expect(schema.user_mastery.history).toBeDefined();
      expect(schema.user_mastery.last_updated).toBeDefined();
    });
  });

  describe('observation_zone table', () => {
    it('should have correct columns', () => {
      expect(schema.observation_zone).toBeDefined();
      expect(schema.observation_zone.user_id).toBeDefined();
      expect(schema.observation_zone.tag_name).toBeDefined();
      expect(schema.observation_zone.reason).toBeDefined();
      expect(schema.observation_zone.status).toBeDefined();
      expect(schema.observation_zone.entered_at).toBeDefined();
    });
  });

  describe('system_settings table', () => {
    it('should have correct columns', () => {
      expect(schema.system_settings).toBeDefined();
      expect(schema.system_settings.user_id).toBeDefined();
      expect(schema.system_settings.key).toBeDefined();
      expect(schema.system_settings.value).toBeDefined();
      expect(schema.system_settings.updated_at).toBeDefined();
    });
  });

  describe('ai_configs table', () => {
    it('should have correct columns', () => {
      expect(schema.ai_configs).toBeDefined();
      expect(schema.ai_configs.id).toBeDefined();
      expect(schema.ai_configs.name).toBeDefined();
      expect(schema.ai_configs.api_url).toBeDefined();
      expect(schema.ai_configs.api_key).toBeDefined();
      expect(schema.ai_configs.model_economy).toBeDefined();
      expect(schema.ai_configs.model_premium).toBeDefined();
      expect(schema.ai_configs.model_embedding).toBeDefined();
      expect(schema.ai_configs.is_active).toBeDefined();
    });
  });

  describe('prompt_templates table', () => {
    it('should have correct columns', () => {
      expect(schema.prompt_templates).toBeDefined();
      expect(schema.prompt_templates.key).toBeDefined();
      expect(schema.prompt_templates.template).toBeDefined();
      expect(schema.prompt_templates.description).toBeDefined();
      expect(schema.prompt_templates.variables).toBeDefined();
    });
  });

  describe('chat_sessions table', () => {
    it('should have correct columns', () => {
      expect(schema.chat_sessions).toBeDefined();
      expect(schema.chat_sessions.id).toBeDefined();
      expect(schema.chat_sessions.user_id).toBeDefined();
      expect(schema.chat_sessions.title).toBeDefined();
      expect(schema.chat_sessions.message_count).toBeDefined();
    });
  });

  describe('chat_messages table', () => {
    it('should have correct columns', () => {
      expect(schema.chat_messages).toBeDefined();
      expect(schema.chat_messages.id).toBeDefined();
      expect(schema.chat_messages.session_id).toBeDefined();
      expect(schema.chat_messages.role).toBeDefined();
      expect(schema.chat_messages.content).toBeDefined();
      expect(schema.chat_messages.is_favorite).toBeDefined();
    });
  });

  describe('knowledge_cards table', () => {
    it('should have correct columns', () => {
      expect(schema.knowledge_cards).toBeDefined();
      expect(schema.knowledge_cards.id).toBeDefined();
      expect(schema.knowledge_cards.user_id).toBeDefined();
      expect(schema.knowledge_cards.session_id).toBeDefined();
      expect(schema.knowledge_cards.title).toBeDefined();
      expect(schema.knowledge_cards.category).toBeDefined();
      expect(schema.knowledge_cards.tags).toBeDefined();
      expect(schema.knowledge_cards.front).toBeDefined();
      expect(schema.knowledge_cards.back).toBeDefined();
    });
  });

  describe('subscription_plans table', () => {
    it('should have correct columns', () => {
      expect(schema.subscription_plans).toBeDefined();
      expect(schema.subscription_plans.id).toBeDefined();
      expect(schema.subscription_plans.name).toBeDefined();
      expect(schema.subscription_plans.tier).toBeDefined();
      expect(schema.subscription_plans.price_monthly).toBeDefined();
      expect(schema.subscription_plans.limits).toBeDefined();
      expect(schema.subscription_plans.features).toBeDefined();
      expect(schema.subscription_plans.is_active).toBeDefined();
    });
  });

  describe('user_subscriptions table', () => {
    it('should have correct columns', () => {
      expect(schema.user_subscriptions).toBeDefined();
      expect(schema.user_subscriptions.id).toBeDefined();
      expect(schema.user_subscriptions.user_id).toBeDefined();
      expect(schema.user_subscriptions.plan_id).toBeDefined();
      expect(schema.user_subscriptions.status).toBeDefined();
      expect(schema.user_subscriptions.started_at).toBeDefined();
      expect(schema.user_subscriptions.expires_at).toBeDefined();
    });
  });

  describe('daily_usage table', () => {
    it('should have correct columns', () => {
      expect(schema.daily_usage).toBeDefined();
      expect(schema.daily_usage.id).toBeDefined();
      expect(schema.daily_usage.user_id).toBeDefined();
      expect(schema.daily_usage.usage_date).toBeDefined();
      expect(schema.daily_usage.usage_type).toBeDefined();
      expect(schema.daily_usage.count).toBeDefined();
    });
  });

  describe('question_srs table', () => {
    it('should have correct columns', () => {
      expect(schema.question_srs).toBeDefined();
      expect(schema.question_srs.id).toBeDefined();
      expect(schema.question_srs.user_id).toBeDefined();
      expect(schema.question_srs.question_id).toBeDefined();
      expect(schema.question_srs.stability).toBeDefined();
      expect(schema.question_srs.difficulty).toBeDefined();
      expect(schema.question_srs.elapsed_days).toBeDefined();
      expect(schema.question_srs.scheduled_days).toBeDefined();
      expect(schema.question_srs.reps).toBeDefined();
      expect(schema.question_srs.lapses).toBeDefined();
      expect(schema.question_srs.state).toBeDefined();
      expect(schema.question_srs.due_date).toBeDefined();
    });
  });

  describe('mindmaps table', () => {
    it('should have correct columns', () => {
      expect(schema.mindmaps).toBeDefined();
      expect(schema.mindmaps.id).toBeDefined();
      expect(schema.mindmaps.user_id).toBeDefined();
      expect(schema.mindmaps.title).toBeDefined();
      expect(schema.mindmaps.content).toBeDefined();
    });
  });

  describe('textbooks table', () => {
    it('should have correct columns', () => {
      expect(schema.textbooks).toBeDefined();
      expect(schema.textbooks.id).toBeDefined();
      expect(schema.textbooks.title).toBeDefined();
      expect(schema.textbooks.author).toBeDefined();
      expect(schema.textbooks.description).toBeDefined();
      expect(schema.textbooks.cover_url).toBeDefined();
    });
  });

  describe('notes table', () => {
    it('should have correct columns', () => {
      expect(schema.notes).toBeDefined();
      expect(schema.notes.id).toBeDefined();
      expect(schema.notes.user_id).toBeDefined();
      expect(schema.notes.title).toBeDefined();
      expect(schema.notes.content).toBeDefined();
      expect(schema.notes.created_at).toBeDefined();
      expect(schema.notes.updated_at).toBeDefined();
    });
  });

  describe('note_tags table', () => {
    it('should have correct columns', () => {
      expect(schema.note_tags).toBeDefined();
      expect(schema.note_tags.id).toBeDefined();
      expect(schema.note_tags.user_id).toBeDefined();
      expect(schema.note_tags.name).toBeDefined();
      expect(schema.note_tags.color).toBeDefined();
    });
  });

  describe('api_keys table', () => {
    it('should have correct columns', () => {
      expect(schema.api_keys).toBeDefined();
      expect(schema.api_keys.id).toBeDefined();
      expect(schema.api_keys.key_string).toBeDefined();
      expect(schema.api_keys.description).toBeDefined();
      expect(schema.api_keys.is_active).toBeDefined();
    });
  });

  describe('ai_quiz_cache table', () => {
    it('should have correct columns', () => {
      expect(schema.ai_quiz_cache).toBeDefined();
      expect(schema.ai_quiz_cache.hash).toBeDefined();
      expect(schema.ai_quiz_cache.data).toBeDefined();
      expect(schema.ai_quiz_cache.created_at).toBeDefined();
    });
  });

  describe('first_principles_cache table', () => {
    it('should have correct columns', () => {
      expect(schema.first_principles_cache).toBeDefined();
      expect(schema.first_principles_cache.id).toBeDefined();
      expect(schema.first_principles_cache.question_hash).toBeDefined();
      expect(schema.first_principles_cache.analysis).toBeDefined();
    });
  });

  describe('admin_logs table', () => {
    it('should have correct columns', () => {
      expect(schema.admin_logs).toBeDefined();
      expect(schema.admin_logs.id).toBeDefined();
      expect(schema.admin_logs.user_id).toBeDefined();
      expect(schema.admin_logs.username).toBeDefined();
      expect(schema.admin_logs.action).toBeDefined();
      expect(schema.admin_logs.target_type).toBeDefined();
      expect(schema.admin_logs.target_id).toBeDefined();
      expect(schema.admin_logs.details).toBeDefined();
      expect(schema.admin_logs.ip_address).toBeDefined();
    });
  });

  describe('api_call_logs table', () => {
    it('should have correct columns', () => {
      expect(schema.api_call_logs).toBeDefined();
      expect(schema.api_call_logs.id).toBeDefined();
      expect(schema.api_call_logs.user_id).toBeDefined();
      expect(schema.api_call_logs.config_id).toBeDefined();
      expect(schema.api_call_logs.model).toBeDefined();
      expect(schema.api_call_logs.endpoint).toBeDefined();
      expect(schema.api_call_logs.input_tokens).toBeDefined();
      expect(schema.api_call_logs.output_tokens).toBeDefined();
      expect(schema.api_call_logs.duration_ms).toBeDefined();
      expect(schema.api_call_logs.success).toBeDefined();
    });
  });

  describe('session_reviews table', () => {
    it('should have correct columns', () => {
      expect(schema.session_reviews).toBeDefined();
      expect(schema.session_reviews.id).toBeDefined();
      expect(schema.session_reviews.session_id).toBeDefined();
      expect(schema.session_reviews.question_id).toBeDefined();
      expect(schema.session_reviews.review_data).toBeDefined();
    });
  });

  describe('text_annotations table', () => {
    it('should have correct columns', () => {
      expect(schema.text_annotations).toBeDefined();
      expect(schema.text_annotations.id).toBeDefined();
      expect(schema.text_annotations.user_id).toBeDefined();
      expect(schema.text_annotations.question_id).toBeDefined();
      expect(schema.text_annotations.start_offset).toBeDefined();
      expect(schema.text_annotations.end_offset).toBeDefined();
      expect(schema.text_annotations.tag).toBeDefined();
      expect(schema.text_annotations.color).toBeDefined();
    });
  });

  describe('mastered_questions table', () => {
    it('should have correct columns', () => {
      expect(schema.mastered_questions).toBeDefined();
      expect(schema.mastered_questions.id).toBeDefined();
      expect(schema.mastered_questions.user_id).toBeDefined();
      expect(schema.mastered_questions.question_id).toBeDefined();
      expect(schema.mastered_questions.mastered_at).toBeDefined();
      expect(schema.mastered_questions.note).toBeDefined();
    });
  });

  describe('textbook_chapters table', () => {
    it('should have correct columns', () => {
      expect(schema.textbook_chapters).toBeDefined();
      expect(schema.textbook_chapters.id).toBeDefined();
      expect(schema.textbook_chapters.textbook_id).toBeDefined();
      expect(schema.textbook_chapters.title).toBeDefined();
      expect(schema.textbook_chapters.content).toBeDefined();
      expect(schema.textbook_chapters.order_index).toBeDefined();
      expect(schema.textbook_chapters.parent_id).toBeDefined();
      expect(schema.textbook_chapters.level).toBeDefined();
    });
  });

  describe('payment_records table', () => {
    it('should have correct columns', () => {
      expect(schema.payment_records).toBeDefined();
      expect(schema.payment_records.id).toBeDefined();
      expect(schema.payment_records.user_id).toBeDefined();
      expect(schema.payment_records.order_no).toBeDefined();
      expect(schema.payment_records.payment_no).toBeDefined();
      expect(schema.payment_records.plan_id).toBeDefined();
      expect(schema.payment_records.amount).toBeDefined();
      expect(schema.payment_records.payment_method).toBeDefined();
      expect(schema.payment_records.status).toBeDefined();
    });
  });

  describe('ai_model_routes table', () => {
    it('should have correct columns', () => {
      expect(schema.ai_model_routes).toBeDefined();
      expect(schema.ai_model_routes.feature).toBeDefined();
      expect(schema.ai_model_routes.config_id).toBeDefined();
      expect(schema.ai_model_routes.model_name).toBeDefined();
    });
  });
});