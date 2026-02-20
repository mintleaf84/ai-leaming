import { getSession } from '@/lib/auth/auth';
import { listSessions, createSession } from '@/lib/services/chat';
import { NextResponse } from 'next/server';

/**
 * 获取当前用户的会话列表
 * GET /api/chat/sessions
 */
export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limitParams = searchParams.get('limit');
        let limit = 50;
        if (limitParams) {
            const parsed = parseInt(limitParams, 10);
            if (!isNaN(parsed) && parsed > 0) limit = parsed;
        }

        const sessions = listSessions(session.user.id, limit);
        return NextResponse.json({ sessions });
    } catch (error: any) {
        console.error('[ChatSessionsAPI] 获取会话列表失败:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * 创建新会话
 * POST /api/chat/sessions
 */
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 可选参数: title
        let title = '新对话';
        try {
            const body = await req.json();
            if (body.title) title = body.title;
        } catch (_) {
            // ignore JSON parse error
        }

        const sessionId = createSession(session.user.id, title);
        return NextResponse.json({ sessionId, title });
    } catch (error: any) {
        console.error('[ChatSessionsAPI] 创建会话失败:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
