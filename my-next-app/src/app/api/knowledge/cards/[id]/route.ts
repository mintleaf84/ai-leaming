import { NextRequest, NextResponse } from 'next/server';
import { getKnowledgeCard, updateKnowledgeCard, deleteKnowledgeCard } from '@/lib/services/knowledge';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/knowledge/cards/[id]
 * 获取单个知识卡片
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const card = getKnowledgeCard(parseInt(id));

        if (!card) {
            return NextResponse.json({ error: '知识卡片不存在' }, { status: 404 });
        }

        return NextResponse.json(card);
    } catch (error: any) {
        console.error('[Knowledge API] GET by ID error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/knowledge/cards/[id]
 * 更新知识卡片
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        const success = await updateKnowledgeCard(parseInt(id), {
            title: body.title,
            category: body.category,
            tags: body.tags,
            front: body.front,
            back: body.back,
            key_points: body.key_points,
        });

        if (!success) {
            return NextResponse.json({ error: '更新失败或卡片不存在' }, { status: 404 });
        }

        return NextResponse.json({ message: '更新成功' });
    } catch (error: any) {
        console.error('[Knowledge API] PUT error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/knowledge/cards/[id]
 * 删除知识卡片
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const success = await deleteKnowledgeCard(parseInt(id));

        if (!success) {
            return NextResponse.json({ error: '删除失败或卡片不存在' }, { status: 404 });
        }

        return NextResponse.json({ message: '删除成功' });
    } catch (error: any) {
        console.error('[Knowledge API] DELETE error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
