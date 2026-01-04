import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/knowledge/cards
 * 获取知识卡片列表
 * Query params: category, limit, format (json | anki)
 */
export async function GET(request: NextRequest) {
    try {
        const { getAllKnowledgeCards, getCategories, getKnowledgeStats, exportToAnkiTSV } = await import('@/lib/knowledge-service');

        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category') || undefined;
        const limit = parseInt(searchParams.get('limit') || '100');
        const format = searchParams.get('format') || 'json';
        const idsStr = searchParams.get('ids');
        const ids = idsStr ? idsStr.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined;

        const cards = getAllKnowledgeCards(category, limit, ids);

        // Anki TSV 导出
        if (format === 'anki') {
            const tsv = exportToAnkiTSV(cards);
            return new NextResponse(tsv, {
                headers: {
                    'Content-Type': 'text/tab-separated-values; charset=utf-8',
                    'Content-Disposition': `attachment; filename="knowledge_cards_${Date.now()}.txt"`,
                },
            });
        }

        const stats = getKnowledgeStats();
        const categories = getCategories();

        return NextResponse.json({
            cards,
            categories,
            stats,
        });
    } catch (error: any) {
        console.error('[Knowledge API] GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/knowledge/cards
 * 创建知识卡片
 */
export async function POST(request: NextRequest) {
    try {
        const { createKnowledgeCard } = await import('@/lib/knowledge-service');
        const body = await request.json();

        const card = {
            title: body.title || '未命名卡片',
            category: body.category || '',
            tags: body.tags || [],
            front: body.front || '',
            back: body.back || '',
            key_points: body.key_points || [],
            session_id: body.session_id,
            source_content: body.source_content,
        };

        const id = await createKnowledgeCard(card);

        return NextResponse.json({ id, message: '知识卡片创建成功' });
    } catch (error: any) {
        console.error('[Knowledge API] POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
