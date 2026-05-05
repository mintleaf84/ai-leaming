/**
 * Drizzle Schema 的全局 Mock
 */
export const notes = {
    id: 'notes.id',
    user_id: 'notes.user_id',
    title: 'notes.title',
    content: 'notes.content',
    updated_at: 'notes.updated_at',
};

export const note_tags = {
    id: 'note_tags.id',
    name: 'note_tags.name',
    user_id: 'note_tags.user_id',
};

export const note_tag_relations = {
    note_id: 'note_tag_relations.note_id',
    tag_id: 'note_tag_relations.tag_id',
};

export const practice_logs = {
    id: 'practice_logs.id',
    user_id: 'practice_logs.user_id',
    question_id: 'practice_logs.question_id',
    is_correct: 'practice_logs.is_correct',
    timestamp: 'practice_logs.timestamp',
    duration_ms: 'practice_logs.duration_ms',
};

export const users = {
    id: 'users.id',
    username: 'users.username',
};

export const questions = {
    id: 'questions.id',
    content: 'questions.content',
};

export const api_call_logs = {
    created_at: 'api_call_logs.created_at',
    success: 'api_call_logs.success',
};

export const ai_quiz_cache = { hash: 'ai_quiz_cache.hash', data: 'ai_quiz_cache.data' };
export const ai_challenge_cache = { hash: 'ai_challenge_cache.hash', data: 'ai_challenge_cache.data' };
export const first_principles_cache = { question_hash: 'first_principles_cache.question_hash', analysis: 'first_principles_cache.analysis' };
export const prompt_templates = { key: 'prompt_templates.key', template: 'prompt_templates.template' };
export const mindmaps = { id: 'mindmaps.id', user_id: 'mindmaps.user_id' };
export const question_srs = {
    user_id: 'question_srs.user_id',
    question_id: 'question_srs.question_id',
    due_date: 'question_srs.due_date',
    state: 'question_srs.state',
    stability: 'question_srs.stability',
    difficulty: 'question_srs.difficulty',
    last_review: 'question_srs.last_review',
};
export const system_settings = {
    user_id: 'system_settings.user_id',
    key: 'system_settings.key',
    value: 'system_settings.value',
};

// --- 订阅相关 Mock ---
export const subscription_plans = {
    id: 'subscription_plans.id',
    name: 'subscription_plans.name',
    tier: 'subscription_plans.tier',
    price_monthly: 'subscription_plans.price_monthly',
    limits: 'subscription_plans.limits',
    features: 'subscription_plans.features',
    is_active: 'subscription_plans.is_active',
    sort_order: 'subscription_plans.sort_order',
    created_at: 'subscription_plans.created_at',
};

export const user_subscriptions = {
    id: 'user_subscriptions.id',
    user_id: 'user_subscriptions.user_id',
    plan_id: 'user_subscriptions.plan_id',
    status: 'user_subscriptions.status',
    started_at: 'user_subscriptions.started_at',
    expires_at: 'user_subscriptions.expires_at',
    created_at: 'user_subscriptions.created_at',
};

export const daily_usage = {
    id: 'daily_usage.id',
    user_id: 'daily_usage.user_id',
    usage_date: 'daily_usage.usage_date',
    usage_type: 'daily_usage.usage_type',
    count: 'daily_usage.count',
};
