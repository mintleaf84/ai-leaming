/**
 * 扩展选题服务 (Drizzle LibSQL 异步版)
 * 支持多种练习模式的选题逻辑
 */

import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, and, sql, inArray, or, desc, lte } from 'drizzle-orm';
import { PracticeConfig } from '@/types/practice';
import { Question } from '@/types';
import { QuestionRowSchema } from '@/lib/schemas';

const { questions, practice_logs, observation_zone, question_srs } = drizzleSchema;

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapRawToQuestion(q: Record<string, unknown>): Question {
    try {
        return QuestionRowSchema.parse(q);
    } catch (err) {
        return {
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
            tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : (q.tags || []),
            type: q.type || 'single',
            dimension: q.dimension || 'knowledge'
        } as Question;
    }
}

/**
 * 构建基础筛选条件 (Drizzle SQL 对象数组)
 */
function buildConditions(config: PracticeConfig) {
    const conditions: ReturnType<typeof eq>[] = [];

    // 题目类型筛选
    if (config.types && config.types.length > 0) {
        conditions.push(inArray(questions.type, config.types));
    }

    // 维度筛选
    if (config.dimensions && config.dimensions.length > 0) {
        conditions.push(inArray(questions.dimension, config.dimensions));
    }

    // 知识点筛选 (json_each)
    if (config.tags && config.tags.length > 0) {
        const tagConditions = config.tags.map(tag => 
            sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})`
        );
        conditions.push(or(...tagConditions)!);
    }

    return conditions;
}

export const practiceSchedulingService = {
    /**
     * 智能刷题模式 (40/40/20)
     */
    async generateSmartSession(config: PracticeConfig, userId: number): Promise<Question[]> {
        const { limit } = config;
        const stubbornCount = Math.floor(limit * 0.4);
        const blindCount = Math.floor(limit * 0.4);
        const regularCount = limit - stubbornCount - blindCount;

        const baseConditions = buildConditions(config);

        // 1. 顽固题
        const stubbornRows = await drizzleDb.selectDistinct({ q: questions })
            .from(questions)
            .innerJoin(observation_zone, sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${observation_zone.tag_name})`)
            .where(and(
                ...baseConditions,
                eq(observation_zone.status, 'active'),
                eq(observation_zone.user_id, userId)
            ))
            .orderBy(sql`RANDOM()`)
            .limit(stubbornCount);
        
        const stubbornQuestions = stubbornRows.map(r => mapRawToQuestion(r.q));
        const usedIds = stubbornQuestions.map(q => q.id);

        // 2. 盲区题
        const blindRows = await drizzleDb.select()
            .from(questions)
            .where(and(
                ...baseConditions,
                sql`NOT EXISTS (SELECT 1 FROM practice_logs WHERE question_id = ${questions.id} AND user_id = ${userId})`,
                usedIds.length > 0 ? sql`${questions.id} NOT IN (${sql.join(usedIds, sql`, `)})` : sql`1=1`
            ))
            .orderBy(sql`RANDOM()`)
            .limit(blindCount);
        
        const blindQuestions = blindRows.map(mapRawToQuestion);
        usedIds.push(...blindQuestions.map(q => q.id));

        // 3. 常规题
        const regularRows = await drizzleDb.select()
            .from(questions)
            .where(and(
                ...baseConditions,
                usedIds.length > 0 ? sql`${questions.id} NOT IN (${sql.join(usedIds, sql`, `)})` : sql`1=1`
            ))
            .orderBy(sql`RANDOM()`)
            .limit(regularCount);
        
        const regularQuestions = regularRows.map(mapRawToQuestion);

        return [...stubbornQuestions, ...blindQuestions, ...regularQuestions].sort(() => Math.random() - 0.5);
    },

    /**
     * 错题强化模式 (FSRS 驱动)
     */
    async generateReviewSession(config: PracticeConfig, userId: number): Promise<Question[]> {
        const baseConditions = buildConditions(config);
        const now = new Date().toISOString();

        // 1. FSRS 到期题目
        const dueRows = await drizzleDb.select({ q: questions })
            .from(questions)
            .innerJoin(question_srs, eq(question_srs.question_id, questions.id))
            .where(and(
                ...baseConditions,
                eq(question_srs.user_id, userId),
                lte(question_srs.due_date, now)
            ))
            .orderBy(question_srs.due_date)
            .limit(config.limit);
        
        const dueQuestions = dueRows.map(r => mapRawToQuestion(r.q));
        if (dueQuestions.length >= config.limit) return dueQuestions;

        // 2. 补充错题记录
        const usedIds = dueQuestions.map(q => q.id);
        const remainingLimit = config.limit - dueQuestions.length;

        const backlogRows = await drizzleDb.select({
                q: questions,
                error_count: sql<number>`COUNT(${practice_logs.id})`
            })
            .from(questions)
            .innerJoin(practice_logs, eq(practice_logs.question_id, questions.id))
            .where(and(
                ...baseConditions,
                eq(practice_logs.user_id, userId),
                eq(practice_logs.is_correct, false),
                usedIds.length > 0 ? sql`${questions.id} NOT IN (${sql.join(usedIds, sql`, `)})` : sql`1=1`
            ))
            .groupBy(questions.id)
            .orderBy(desc(sql`error_count`), sql`RANDOM()`)
            .limit(remainingLimit);
        
        const backlogQuestions = backlogRows.map(r => mapRawToQuestion(r.q));
        return [...dueQuestions, ...backlogQuestions];
    },

    /**
     * 纯错题专项模式
     */
    async generateMistakesSession(config: PracticeConfig, userId: number): Promise<Question[]> {
        const baseConditions = buildConditions(config);

        const rows = await drizzleDb.select({
                q: questions,
                error_count: sql<number>`COUNT(${practice_logs.id})`
            })
            .from(questions)
            .innerJoin(practice_logs, eq(practice_logs.question_id, questions.id))
            .where(and(
                ...baseConditions,
                eq(practice_logs.user_id, userId),
                eq(practice_logs.is_correct, false)
            ))
            .groupBy(questions.id)
            .orderBy(desc(sql`error_count`), sql`RANDOM()`)
            .limit(config.limit);

        return rows.map(r => mapRawToQuestion(r.q));
    },

    /**
     * 专项突破模式
     */
    async generateFocusSession(config: PracticeConfig, userId: number): Promise<Question[]> {
        const baseConditions = buildConditions(config);
        if (baseConditions.length === 0) return this.generateRandomSession(config, userId);

        const rows = await drizzleDb.select()
            .from(questions)
            .where(and(...baseConditions))
            .orderBy(sql`RANDOM()`)
            .limit(config.limit);

        return rows.map(mapRawToQuestion);
    },

    /**
     * 模拟考试模式
     */
    async generateExamSession(config: PracticeConfig, _userId: number): Promise<Question[]> {
        const baseConditions = buildConditions(config);
        const rows = await drizzleDb.select()
            .from(questions)
            .where(and(...baseConditions))
            .orderBy(sql`RANDOM()`)
            .limit(config.limit);

        return rows.map(mapRawToQuestion).sort((a, b) => a.id - b.id);
    },

    /**
     * 随机挑战模式
     */
    async generateRandomSession(config: PracticeConfig, _userId: number): Promise<Question[]> {
        const baseConditions = buildConditions(config);
        const rows = await drizzleDb.select()
            .from(questions)
            .where(and(...baseConditions))
            .orderBy(sql`RANDOM()`)
            .limit(config.limit);

        return rows.map(mapRawToQuestion);
    },

    /**
     * 根据配置生成练习会话
     */
    async generateSessionByConfig(config: PracticeConfig, userId: number): Promise<Question[]> {
        switch (config.mode) {
            case 'smart': return this.generateSmartSession(config, userId);
            case 'review': return this.generateReviewSession(config, userId);
            case 'mistakes': return this.generateMistakesSession(config, userId);
            case 'focus': return this.generateFocusSession(config, userId);
            case 'exam': return this.generateExamSession(config, userId);
            case 'random': return this.generateRandomSession(config, userId);
            default: return this.generateSmartSession(config, userId);
        }
    }
};

/**
 * 获取所有可用的知识点标签
 */
export async function getAllTags(): Promise<string[]> {
    const result = await drizzleDb.selectDistinct({
        tag: sql<string>`json_each.value`
    })
    .from(sql`${questions}, json_each(${questions.tags})`)
    .orderBy(sql`json_each.value`)
    .all();
    
    return result.map(r => r.tag);
}

/**
 * 获取用户错题知识点统计
 */
export async function getUserWrongTags(userId: number): Promise<{ tag: string; count: number }[]> {
    const result = await drizzleDb.select({
        tag: sql<string>`je.value`,
        count: sql<number>`COUNT(*)`
    })
    .from(practice_logs)
    .innerJoin(questions, eq(questions.id, practice_logs.question_id))
    .innerJoin(sql`json_each(${questions.tags}) AS je`, sql`1=1`)
    .where(and(
        eq(practice_logs.user_id, userId),
        eq(practice_logs.is_correct, false)
    ))
    .groupBy(sql`je.value`)
    .orderBy(desc(sql`count`))
    .all();

    return result;
}
