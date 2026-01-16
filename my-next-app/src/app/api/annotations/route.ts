import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/auth';
import db from '@/lib/db';

// 类型定义
interface Annotation {
    id: number;
    user_id: number;
    question_id: number;
    start_offset: number;
    end_offset: number;
    tag: 'highlight' | 'underline' | 'wavy';
    color: string | null;
    created_at: string;
}

/**
 * GET /api/annotations?questionId=123
 * 获取题目的所有标注
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const questionId = searchParams.get('questionId');

        if (!questionId) {
            return NextResponse.json({ error: '缺少 questionId 参数' }, { status: 400 });
        }

        const annotations = db.prepare(`
            SELECT id, start_offset, end_offset, tag, color, created_at
            FROM text_annotations
            WHERE user_id = ? AND question_id = ?
            ORDER BY start_offset ASC
        `).all(session.user.id, parseInt(questionId)) as Annotation[];

        return NextResponse.json({ annotations });
    } catch (error: any) {
        console.error('[Annotations API] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/annotations
 * 添加新标注
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { questionId, startOffset, endOffset, tag, color } = await req.json();

        if (!questionId || startOffset === undefined || endOffset === undefined || !tag) {
            return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }

        if (!['highlight', 'underline', 'wavy'].includes(tag)) {
            return NextResponse.json({ error: '无效的标记类型' }, { status: 400 });
        }

        const result = db.prepare(`
            INSERT OR REPLACE INTO text_annotations (user_id, question_id, start_offset, end_offset, tag, color)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(session.user.id, questionId, startOffset, endOffset, tag, color || null);

        return NextResponse.json({
            id: result.lastInsertRowid,
            message: '标注已保存'
        });
    } catch (error: any) {
        console.error('[Annotations API] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/annotations?id=123
 * 删除标注
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
        }

        // 确保只能删除自己的标注
        const result = db.prepare(`
            DELETE FROM text_annotations
            WHERE id = ? AND user_id = ?
        `).run(parseInt(id), session.user.id);

        if (result.changes === 0) {
            return NextResponse.json({ error: '标注不存在或无权删除' }, { status: 404 });
        }

        return NextResponse.json({ message: '标注已删除' });
    } catch (error: any) {
        console.error('[Annotations API] DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
