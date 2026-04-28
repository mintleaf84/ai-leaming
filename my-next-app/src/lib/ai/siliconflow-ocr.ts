import 'server-only';

import { getAiConfig } from '@/lib/ai/client';
// Dynamic import used inside function
// import * as mupdf from 'mupdf';



/**
 * 使用 MuPDF (WASM) 将 PDF 转换为图片，然后调用 SiliconFlow DeepSeek-OCR
 */
export async function performOCR(pdfBuffer: Buffer): Promise<string> {
    try {

        const { apiKey, baseURL } = await getAiConfig('premium');

        if (!apiKey) {
            throw new Error('Missing API Key for OCR');
        }

        // 1. 使用 MuPDF 打开 PDF
        const mupdf = await import('mupdf');
        console.log('[Debug] mupdf keys:', Object.keys(mupdf));
        console.log('[Debug] mupdf.Document is type:', typeof mupdf.Document);

        // Ensure Uint8Array
        const data = new Uint8Array(pdfBuffer);
        const doc = mupdf.Document.openDocument(data, "application/pdf");
        const pageCount = doc.countPages();

        console.log(`[OCR] PDF 共 ${pageCount} 页，开始逐页识别...`);

        let fullText = '';
        const DPI = 150; // 分辨率，150 DPI 足够 OCR
        const scale = DPI / 72; // PDF 默认 72 DPI

        for (let i = 0; i < pageCount; i++) {
            try {
                console.log(`[OCR] 处理第 ${i + 1}/${pageCount} 页...`);

                const page = doc.loadPage(i);
                const _bounds = page.getBounds();

                // 创建 Pixmap (图像)
                const pixmap = page.toPixmap(
                    mupdf.Matrix.scale(scale, scale),
                    mupdf.ColorSpace.DeviceRGB,
                    false, // alpha
                    true   // annots
                );

                // 转换为 PNG Buffer
                const pngBuffer = pixmap.asPNG();
                const base64Image = Buffer.from(pngBuffer).toString('base64');

                // 2. 调用 SiliconFlow VLM API
                // 使用硬编码的 SiliconFlow 端点，因为 DeepSeek-OCR 模型仅在 SiliconFlow 可用
                const apiEndpoint = 'https://api.siliconflow.cn/v1/chat/completions';

                console.log(`[OCR] Calling API: ${apiEndpoint}`);

                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "deepseek-ai/DeepSeek-OCR",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "请识别这张图片中的所有文字，按 Markdown 格式输出。保留原有的标题层级、表格结构和数学公式（使用 LaTeX）。"
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:image/png;base64,${base64Image}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 4096,
                        temperature: 0.1
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`[OCR] 第 ${i + 1} 页 API 错误:`, errText);
                    fullText += `\n\n[第 ${i + 1} 页识别失败]\n\n`;
                    continue;
                }

                const data = await response.json();
                const pageContent = data.choices?.[0]?.message?.content || '';
                fullText += `\n\n${pageContent}\n\n`;

            } catch (pageError) {
                console.error(`[OCR] 第 ${i + 1} 页处理失败:`, pageError);
                fullText += `\n\n[第 ${i + 1} 页处理出错]\n\n`;
            }
        }

        return fullText.trim();
    } catch (error) {
        console.error('[OCR] Fatal Error:', error);
        throw error;
    }
}
