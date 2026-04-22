import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, like, and, sql, desc, inArray } from 'drizzle-orm';
import { ragService } from '@/lib/ai/rag';
import { Question, Dimension } from '@/types';
import { QuestionRowSchema } from '@/lib/schemas';
import logger from '@/lib/logger';

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapQuestion(q: any): Question {
    try {
        return QuestionRowSchema.parse(q);
    } catch (err) {
        logger.error({ err, questionId: q.id }, '[QuestionService] Question mapping failed');
        return {
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
            tags: typeof q.tags === 'string' ? JSON.parse(q.tags) : (q.tags || []),
            type: q.type || 'single',
            dimension: q.dimension || 'knowledge'
        } as Question;
    }
}

export interface QuestionFilter {
    limit?: number;
    offset?: number;
    tags?: string[];
    type?: string[];
    search?: string;
    dimension?: Dimension;
}

export const questionService = {
    /**
     * 搜索相似题目 (向量检索回退)
     */
    searchSimilarQuestions: async (content: string, limit: number = 3) => {
        try {
            const embedding = await ragService.getEmbedding(content);
            
            // 检查向量插件是否存在 (由于 Drizzle 不直接暴露 raw db handle 检查，通常在 init 时检查)
            // 这里使用 sql raw 尝试
            const results = await drizzleDb.all<any>(sql`
                SELECT q.*, v.distance
                FROM questions_vec v
                JOIN questions q ON q.id = v.rowid
                WHERE v.embedding MATCH ${JSON.stringify(embedding)}
                  AND k = ${limit}
                ORDER BY v.distance
            `);

            return results.map((q: any) => mapQuestion(q));
        } catch (error) {
            logger.error({ err: error }, '[QuestionService] 相似题目检索失败');
            return [];
        }
    },

    /**
     * 获取单个题目
     */
    async getById(id: number): Promise<Question | null> {
        const result = await drizzleDb.query.questions.findFirst({
            where: eq(drizzleSchema.questions.id, id)
        });
        return result ? mapQuestion(result) : null;
    },

    /**
     * 列表查询
     */
    async list(filter: QuestionFilter = {}): Promise<{ items: Question[]; total: number }> {
        const conditions = [];

        if (filter.search) {
            conditions.push(like(drizzleSchema.questions.content, `%${filter.search}%`));
        }

        if (filter.dimension) {
            conditions.push(eq(drizzleSchema.questions.dimension, filter.dimension));
        }

        if (filter.type && filter.type.length > 0) {
            conditions.push(inArray(drizzleSchema.questions.type, filter.type as any));
        }

        if (filter.tags && filter.tags.length > 0) {
            // SQLite JSON 数组筛选
            filter.tags.forEach(tag => {
                conditions.push(sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})`);
            });
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        // 并发查询总数和数据
        const [items, totalResult] = await Promise.all([
            drizzleDb.query.questions.findMany({
                where,
                orderBy: [desc(drizzleSchema.questions.id)],
                limit: filter.limit || 20,
                offset: filter.offset || 0
            }),
            drizzleDb.select({ count: sql<number>`count(*)` })
                .from(drizzleSchema.questions)
                .where(where)
                .get()
        ]);

        return {
            items: items.map((q: any) => mapQuestion(q)),
            total: totalResult?.count || 0
        };
    },

    /**
     * 创建题目 (管理后台)
     */
    async create(data: Partial<Question>) {
        const result = await drizzleDb.insert(drizzleSchema.questions).values({
            ...data,
            options: JSON.stringify(data.options),
            tags: JSON.stringify(data.tags),
        } as any).returning();
        return result[0];
    },

    /**
     * 更新题目 (管理后台)
     */
    async update(id: number, data: Partial<Question>) {
        const updateData: any = { ...data };
        if (data.options) updateData.options = JSON.stringify(data.options);
        if (data.tags) updateData.tags = JSON.stringify(data.tags);

        await drizzleDb.update(drizzleSchema.questions)
            .set(updateData)
            .where(eq(drizzleSchema.questions.id, id));
        return true;
    },

    /**
     * 删除题目 (管理后台)
     */
    async delete(id: number) {
        await drizzleDb.delete(drizzleSchema.questions)
            .where(eq(drizzleSchema.questions.id, id));
        return true;
    },

    /**
     * 批量导入 (管理后台)
     */
    async bulkCreate(questions: any[]) {
        return await drizzleDb.transaction(async (tx) => {
            const values = questions.map(q => ({
                ...q,
                options: JSON.stringify(q.options),
                tags: JSON.stringify(q.tags),
                created_at: sql`CURRENT_TIMESTAMP`
            }));
            
            // SQLite 批量插入限制 (通常为 999 变量，Drizzle 会自动分批)
            return await tx.insert(drizzleSchema.questions).values(values);
        });
    }
};