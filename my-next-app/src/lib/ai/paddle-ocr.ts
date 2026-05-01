/**
 * PaddleOCR-VL 集成服务
 * 基于百度飞桨 PaddleOCR 的同步 layout-parsing API
 * 直接发送请求并获取结果，无需轮询
 */

const API_URL = "https://8fybmegb491cz67c.aistudio-app.com/layout-parsing";

// 请求超时时间：3 分钟（大文件识别可能较慢）
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

import { env } from '@/env';

/**
 * 使用 PaddleOCR-VL 识别文件内容
 * 支持图片和 PDF，返回 Markdown 格式文本
 */
export async function performPaddleOCR(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
): Promise<string> {
    const token = env.PADDLE_OCR_TOKEN;
    if (!token) {
        throw new Error('缺少 PADDLE_OCR_TOKEN 环境变量，请在 .env.local 中配置');
    }

    // 判断文件类型：0 = PDF, 1 = 图片
    const fileType = mimeType === 'application/pdf' ? 0 : 1;

    console.log(`[PaddleOCR] 开始识别: ${fileName} (${mimeType}, ${Math.round(fileBuffer.length / 1024)}KB)`);

    // 将文件转为 Base64
    const fileData = Buffer.from(fileBuffer).toString('base64');

    const payload = {
        file: fileData,
        fileType,
        // --- 版式清洗：仅过滤页码，保留其余内容 ---
        // 注意：对于截图类输入，过滤过多标签会导致正文丢失
        markdownIgnoreLabels: [
            "number",          // 页码
        ],
        useDocOrientationClassify: false,  // 截图方向已正确
        useDocUnwarping: false,            // 数字图片无需矫正
        useLayoutDetection: true,          // 开启版式检测
        useChartRecognition: true,         // 开启图表识别（支持树状图/思维导图）
        useSealRecognition: false,         // 不需要印章识别
        useOcrForImageBlock: true,         // 对图片块也做 OCR（截图中可能有嵌套图片）
        relevelTitles: true,               // 自动调整 Markdown 标题层级
        mergeTables: true,                 // 合并跨页表格
        layoutNms: true,                   // 布局去重
        restructurePages: true,            // 重构页面结构
        layoutShapeMode: "auto",           // 自动检测版式形状
        promptLabel: "ocr",                // OCR 模式提示
        // --- 分辨率控制 ---
        minPixels: 147384,                 // 最小像素量（保证小图也有足够精度）
        maxPixels: 2822400,                // 最大像素量（约 1680x1680）
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[PaddleOCR] 请求失败:', errText);
            throw new Error(`PaddleOCR 识别失败: ${response.status}`);
        }

        const result = (await response.json()).result;
        return extractMarkdown(result);
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`PaddleOCR 请求超时（超过 ${REQUEST_TIMEOUT_MS / 1000} 秒）`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * 从 PaddleOCR 响应中提取所有页面的 Markdown 文本
 */
function extractMarkdown(result: Record<string, unknown>): string {
    const pages = (result?.layoutParsingResults || []) as Array<Record<string, Record<string, string>>>;
    let fullText = '';

    for (const page of pages) {
        const markdown = page.markdown?.text || '';
        if (markdown) {
            fullText += markdown + '\n\n';
        }
    }

    console.log(`[PaddleOCR] 原始提取: ${fullText.length} 字符`);

    // 清理无法访问的临时图片引用和残留 HTML 标签
    const cleaned = fullText
        .replace(/!\[.*?\]\(.*?\)/g, '')           // 移除 ![alt](url) 格式的图片
        .replace(/<img[^>]*>/gi, '')                // 移除 <img> 标签
        .replace(/<div[^>]*>\s*<\/div>/gi, '')      // 移除空 <div> 标签
        .replace(/<\/?(?:div|span|p|br\s*\/?)[^>]*>/gi, '\n')  // 将块级 HTML 标签转为换行
        .replace(/\n{3,}/g, '\n\n')                // 合并多余空行
        .trim();

    console.log(`[PaddleOCR] 清理后: ${cleaned.length} 字符`);
    return cleaned;
}
