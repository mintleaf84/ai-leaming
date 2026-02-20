import { getSession as getAuthSession } from '@/lib/auth/auth';
import { getSession, getSessionMessages, deleteSession } from '@/lib/services/chat';
import { NextResponse } from 'next/server';

/**
 * 获取特定会话的所有消息
 * GET /api/chat/sessions/:id
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authSession = await getAuthSession();
        if (!authSession || !authSession.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await params;
        const sessionId = parseInt(resolvedParams.id, 10);
        if (isNaN(sessionId)) {
            return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
        }

        // 检查会话是否存在且属于当前用户
        const session = getSession(authSession.user.id, sessionId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // 获取该会话下的所有消息
        const messages = getSessionMessages(authSession.user.id, sessionId);

        return NextResponse.json({ session, messages });
    } catch (error: any) {
        console.error(`[ChatSessionAPI] 获取会话详情失败:`, error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * 删除特定会话及其所有消息
 * DELETE /api/chat/sessions/:id
 */
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authSession = await getAuthSession();
        if (!authSession || !authSession.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await params;
        const sessionId = parseInt(resolvedParams.id, 10);
        if (isNaN(sessionId)) {
            return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
        }

        // 删除会话及其消息
        deleteSession(authSession.user.id, sessionId);

        return NextResponse.json({ success: true, message: 'Session deleted successfully' });
    } catch (error: any) {
        console.error(`[ChatSessionAPI] 删除会话失败:`, error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
