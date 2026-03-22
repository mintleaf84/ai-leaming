import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import db from '@/lib/db'
import { requireRole } from '@/lib/auth/auth'
import { Question } from '@/lib/types'

export const adminRoute = new OpenAPIHono()

// Query Schema
const ExportQuestionsQuerySchema = z.object({
    search: z.string().optional().openapi({ description: '搜索内容' }),
    tag: z.string().optional().openapi({ description: '过滤标签' }),
    dimension: z.string().optional().openapi({ description: '过滤维度' }),
})

// Route Definition
const exportQuestionsDef = createRoute({
    method: 'get',
    path: '/export/questions',
    summary: '导出题库为CSV',
    description: '根据条件导出全量题库为 CSV 格式文件，仅限管理员调用。',
    tags: ['Admin'],
    request: {
        query: ExportQuestionsQuerySchema,
    },
    responses: {
        200: {
            description: 'CSV 文件数据',
            content: {
                'text/csv': {
                    schema: z.string()
                }
            }
        },
        401: {
            description: '未授权或不是管理员',
        }
    }
})

// Helper functions for CSV formatting
function escapeCsv(field: any): string {
    if (field === null || field === undefined) return '';
    const str = String(field);
    // If it contains quotes, commas, or newlines, wrap in quotes and escape inner quotes
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Handler
adminRoute.openapi(exportQuestionsDef, async (c) => {
    // 1. Auth Check
    try {
        await requireRole(['admin']);
    } catch (e: any) {
        return c.json({ error: e.message || 'Unauthorized' }, 401 as any);
    }

    // 2. Parse Queries
    const { search, tag, dimension } = c.req.valid('query')

    // 3. Build Query
    const conditions: string[] = []
    const params: any[] = []

    if (search) {
        conditions.push('content LIKE ?')
        params.push(`%${search}%`)
    }
    if (tag) {
        conditions.push('tags LIKE ?')
        params.push(`%${tag}%`)
    }
    if (dimension) {
        conditions.push('dimension = ?')
        params.push(dimension)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const dataSql = `SELECT * FROM questions ${whereClause} ORDER BY id DESC`

    // Fetch all matching questions (using explicit any for newly added DB columns)
    const questions = db.prepare(dataSql).all(...params) as any[];

    // 4. Generate CSV String
    const headers = [
        'ID', '类型', '维度', '题干', '选项', '答案', '解析', '标签',
        '正确率(%)', '易错项', '关联资料', '创建时间'
    ];

    const rows = []
    
    // Add UTF-8 BOM so Excel opens it correctly
    // \uFEFF is the Byte Order Mark
    let csvContent = '\uFEFF' + headers.map(escapeCsv).join(',') + '\n';

    for (const q of questions) {
        const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
        const parsedTags = typeof q.tags === 'string' ? JSON.parse(q.tags) : (q.tags || []);

        const row = [
            q.id,
            q.type,
            q.dimension,
            q.content,
            parsedOptions.join(' | '),
            q.answer,
            q.explanation,
            parsedTags.join(' | '),
            q.correct_ratio,
            q.most_wrong_answer,
            q.material,
            q.created_at
        ];

        csvContent += row.map(escapeCsv).join(',') + '\n';
    }

    // 5. Return Response
    const fileName = `questions_export_${new Date().toISOString().split('T')[0]}.csv`;
    return c.text(csvContent, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
    });
})
