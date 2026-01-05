
import { NextRequest, NextResponse } from 'next/server';
import { textbookService } from '@/lib/services/textbook';
import { parseMarkdownToChapters } from '@/lib/utils/markdown-parser';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const title = formData.get('title') as string || file.name.replace(/\.[^/.]+$/, "");
        const author = formData.get('author') as string || 'Unknown';
        const description = formData.get('description') as string || '';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let text = '';

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            try {
                // 使用 unpdf 提取 PDF 文本 (纯 JavaScript，无原生依赖)
                const { extractText } = await import('unpdf');
                const result = await extractText(buffer);
                text = result.text || '';

                if (!text || text.trim().length < 50) {
                    // 如果提取的文本太少，可能是扫描件
                    console.warn('[PDF] 提取的文本过少，可能是扫描版 PDF');
                    return NextResponse.json({
                        error: '此 PDF 可能是扫描件（图片型），无法直接提取文字。请上传文字版 PDF 或 Markdown/Text 格式文件。'
                    }, { status: 400 });
                }

                console.log(`[PDF] 成功提取 ${text.length} 字符`);
            } catch (pdfError: any) {
                console.error('[PDF] 解析失败:', pdfError);
                return NextResponse.json({
                    error: `PDF 解析失败: ${pdfError.message}`
                }, { status: 400 });
            }
        } else {
            text = buffer.toString('utf-8');
        }

        // Create Textbook Record
        const textbookId = await textbookService.createTextbook({
            title,
            author,
            description,
        });

        // Parse and Save Chapters
        const chapters = parseMarkdownToChapters(text);

        if (chapters.length === 0) {
            await textbookService.addChapter({
                textbook_id: textbookId,
                title: '正文',
                content: text,
                order_index: 1,
                level: 1
            });
        } else {
            let order = 1;
            for (const chapter of chapters) {
                await textbookService.addChapter({
                    textbook_id: textbookId,
                    title: chapter.title,
                    content: chapter.content,
                    order_index: order++,
                    level: chapter.level,
                    parent_id: undefined
                });
            }
        }

        return NextResponse.json({ success: true, id: textbookId, chaptersCount: chapters.length || 1 });
    } catch (error: any) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
