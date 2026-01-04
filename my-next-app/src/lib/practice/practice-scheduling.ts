/**
 * 扩展选题服务
 * 支持多种练习模式的选题逻辑
 */

import db from '@/lib/db';
import { PracticeConfig, PracticeMode } from './practice-types';

export interface Question {
    id: number;
    content: string;
    options: string;
    answer: string;
    explanation: string;
    tags: string;
    dimension: string;
    type: string;
}

/**
 * 构建基础筛选条件
 */
function buildWhereClause(config: PracticeConfig): { where: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    // 题目类型筛选
    if (config.types && config.types.length > 0) {
        conditions.push(`q.type IN (${config.types.map(() => '?').join(', ')})`);
        params.push(...config.types);
    }

    // 维度筛选
    if (config.dimensions && config.dimensions.length > 0) {
        conditions.push(`q.dimension IN (${config.dimensions.map(() => '?').join(', ')})`);
        params.push(...config.dimensions);
    }

    // 知识点筛选
    if (config.tags && config.tags.length > 0) {
        const tagConditions = config.tags.map(() =>
            `EXISTS (SELECT 1 FROM json_each(q.tags) WHERE value = ?)`
        ).join(' OR ');
        conditions.push(`(${tagConditions})`);
        params.push(...config.tags);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
}

/**
 * 智能刷题模式 (40/40/20)
 * 40% 顽固题 + 40% 盲区 + 20% 随机
 */
function generateSmartSession(config: PracticeConfig, userId: number): Question[] {
    const { limit } = config;
    const stubbornCount = Math.floor(limit * 0.4);
    const blindCount = Math.floor(limit * 0.4);
    const regularCount = limit - stubbornCount - blindCount;

    const { where, params } = buildWhereClause(config);

    // 1. 顽固题：观察区知识点的题目
    const stubbornQuestions = db.prepare(`
    SELECT DISTINCT q.* FROM questions q
    JOIN observation_zone oz ON EXISTS (
      SELECT 1 FROM json_each(q.tags) WHERE value = oz.tag_name
    )
    ${where ? where + ' AND oz.status = ? AND oz.user_id = ?' : 'WHERE oz.status = ? AND oz.user_id = ?'}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, 'active', userId, stubbornCount) as Question[];

    const usedIds = stubbornQuestions.map(q => q.id);

    // 2. 盲区题：从未练习过的题目
    const blindQuestions = db.prepare(`
    SELECT q.* FROM questions q
    ${where} ${where ? 'AND' : 'WHERE'} NOT EXISTS (
      SELECT 1 FROM practice_logs pl WHERE pl.question_id = q.id AND pl.user_id = ?
    )
    ${usedIds.length > 0 ? `AND q.id NOT IN (${usedIds.join(',')})` : ''}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, userId, blindCount) as Question[];

    usedIds.push(...blindQuestions.map(q => q.id));

    // 3. 常规题：随机
    const regularQuestions = db.prepare(`
    SELECT q.* FROM questions q
    ${where} ${where ? 'AND' : 'WHERE'} q.id NOT IN (${usedIds.length > 0 ? usedIds.join(',') : '0'})
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, regularCount) as Question[];

    // 合并并打乱
    const session = [...stubbornQuestions, ...blindQuestions, ...regularQuestions];
    return session.sort(() => Math.random() - 0.5);
}

/**
 * 错题强化模式
 * 只练习历史错题，按错误次数排序
 */
function generateReviewSession(config: PracticeConfig, userId: number): Question[] {
    const { where, params } = buildWhereClause(config);

    const questions = db.prepare(`
    SELECT q.*, COUNT(pl.id) as error_count
    FROM questions q
    JOIN practice_logs pl ON pl.question_id = q.id
    ${where} ${where ? 'AND' : 'WHERE'} pl.user_id = ? AND pl.is_correct = 0
    GROUP BY q.id
    ORDER BY error_count DESC, RANDOM()
    LIMIT ?
  `).all(...params, userId, config.limit) as Question[];

    return questions;
}

/**
 * 专项突破模式
 * 按指定知识点或维度筛选
 */
function generateFocusSession(config: PracticeConfig, userId: number): Question[] {
    const { where, params } = buildWhereClause(config);

    if (!where) {
        // 如果没有筛选条件，回退到随机模式
        return generateRandomSession(config, userId);
    }

    const questions = db.prepare(`
    SELECT q.* FROM questions q
    ${where}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, config.limit) as Question[];

    return questions;
}

/**
 * 模拟考试模式
 * 随机抽题，按 ID 顺序排列（模拟真实考试）
 */
function generateExamSession(config: PracticeConfig, userId: number): Question[] {
    const { where, params } = buildWhereClause(config);

    const questions = db.prepare(`
    SELECT q.* FROM questions q
    ${where}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, config.limit) as Question[];

    // 模拟考试按 ID 排序，保持一致性
    return questions.sort((a, b) => a.id - b.id);
}

/**
 * 随机挑战模式
 * 完全随机
 */
function generateRandomSession(config: PracticeConfig, userId: number): Question[] {
    const { where, params } = buildWhereClause(config);

    const questions = db.prepare(`
    SELECT q.* FROM questions q
    ${where}
    ORDER BY RANDOM()
    LIMIT ?
  `).all(...params, config.limit) as Question[];

    return questions;
}

/**
 * 根据配置生成练习会话
 */
export function generateSessionByConfig(config: PracticeConfig, userId: number): Question[] {
    switch (config.mode) {
        case 'smart':
            return generateSmartSession(config, userId);
        case 'review':
            return generateReviewSession(config, userId);
        case 'focus':
            return generateFocusSession(config, userId);
        case 'exam':
            return generateExamSession(config, userId);
        case 'random':
            return generateRandomSession(config, userId);
        default:
            return generateSmartSession(config, userId);
    }
}

/**
 * 获取所有可用的知识点标签
 */
export function getAllTags(): string[] {
    const result = db.prepare(`
    SELECT DISTINCT value as tag
    FROM questions, json_each(questions.tags)
    ORDER BY value
  `).all() as { tag: string }[];

    return result.map(r => r.tag);
}

/**
 * 获取用户错题知识点统计
 */
export function getUserWrongTags(userId: number): { tag: string; count: number }[] {
    const result = db.prepare(`
    SELECT je.value as tag, COUNT(*) as count
    FROM practice_logs pl
    JOIN questions q ON q.id = pl.question_id
    JOIN json_each(q.tags) je
    WHERE pl.user_id = ? AND pl.is_correct = 0
    GROUP BY je.value
    ORDER BY count DESC
  `).all(userId) as { tag: string; count: number }[];

    return result;
}
