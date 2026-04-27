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
