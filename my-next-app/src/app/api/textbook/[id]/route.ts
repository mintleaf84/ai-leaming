
import { textbookService } from '@/lib/services/textbook';

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const textbookId = parseInt(id);

        if (isNaN(textbookId)) {
            return new Response('Invalid ID', { status: 400 });
        }

        await textbookService.deleteTextbook(textbookId);

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error('[API] Delete textbook failed:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
