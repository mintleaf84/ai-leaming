import { NextRequest, NextResponse } from 'next/server';
import { generateTextWrapper } from '@/lib/ai/client';
import { getSession } from '@/lib/auth/auth';
import db from '@/lib/db';

// 确保缓存表存在
function ensureCacheTable() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS first_principles_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_hash TEXT UNIQUE NOT NULL,
                analysis TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_fp_cache_hash ON first_principles_cache(question_hash);
        `);
    } catch (e) {
        console.error('[FirstPrinciples] 创建缓存表失败:', e);
    }
}

// 生成内容哈希 (简单使用内容前100字符+长度作为标识)
function generateHash(content: string): string {
    const normalized = content.trim().slice(0, 100) + content.length;
    // 简单哈希
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { questionContent, explanation, wrongAnswer, correctAnswer } = await req.json();

        if (!questionContent) {
            return NextResponse.json({ error: '缺少题目内容' }, { status: 400 });
        }

        ensureCacheTable();

        // 生成缓存 key
        const cacheKey = generateHash(questionContent + correctAnswer + (wrongAnswer || ''));

        // 检查缓存
        const cached = db.prepare(
            'SELECT analysis FROM first_principles_cache WHERE question_hash = ?'
        ).get(cacheKey) as { analysis: string } | undefined;

        if (cached) {
            console.log('[FirstPrinciples] 命中缓存');
            return NextResponse.json({ analysis: cached.analysis, cached: true });
        }

        // 构建 Prompt
        const prompt = `请用"第一性原理"解析这道题。要求：
1. 直接给答案，只说底层逻辑，不超过200字
2. 不要使用黑话，用通俗易懂的语言

题目：${questionContent}
正确答案：${correctAnswer}
${wrongAnswer ? `用户选择：${wrongAnswer}` : ''}
${explanation ? `参考解析：${explanation}` : ''}

回复格式：
【答案】X
【核心逻辑】...`;

        // 调用 AI
        console.log('[FirstPrinciples] 开始调用 AI...');
        let text: string;
        try {
            const result = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
                timeout: 30000,
                retries: 1,
            });
            text = result.text;
            console.log('[FirstPrinciples] AI 调用成功，长度:', text.length);
        } catch (aiError: any) {
            console.error('[FirstPrinciples] AI 调用失败:', aiError.message);
            return NextResponse.json({ error: `AI 分析失败: ${aiError.message}` }, { status: 500 });
        }

        // 保存到缓存
        try {
            db.prepare(
                'INSERT OR REPLACE INTO first_principles_cache (question_hash, analysis) VALUES (?, ?)'
            ).run(cacheKey, text);
        } catch (cacheError) {
            console.error('[FirstPrinciples] 缓存保存失败:', cacheError);
        }

        return NextResponse.json({ analysis: text, cached: false });

    } catch (error: any) {
        console.error('[FirstPrinciples API] error:', error);
        return NextResponse.json({ error: error.message || '分析失败' }, { status: 500 });
    }
}
