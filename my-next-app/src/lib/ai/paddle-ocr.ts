/**
 * PaddleOCR-VL 集成服务
 * 基于百度飞桨 PaddleOCR 的异步 Job API
 * 流程：提交任务 → 轮询状态 → 获取结果
 */

const JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
const DEFAULT_MODEL = "PaddleOCR-VL-1.5";
// 轮询间隔 3 秒，最多等待 5 分钟
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000;

/**
 * 使用 PaddleOCR-VL 识别文件内容
 * 支持图片和 PDF，返回 Markdown 格式文本
 */
export async function performPaddleOCR(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
): Promise<string> {
    const token = process.env.PADDLE_OCR_TOKEN;
    if (!token) {
        throw new Error('缺少 PADDLE_OCR_TOKEN 环境变量，请在 .env.local 中配置');
    }

    // 1. 提交 OCR 任务
    console.log(`[PaddleOCR] 提交任务: ${fileName} (${mimeType}, ${Math.round(fileBuffer.length / 1024)}KB)`);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    formData.append('file', blob, fileName);
    formData.append('model', DEFAULT_MODEL);
    formData.append('optionalPayload', JSON.stringify({
        useDocOrientationClassify: false,  // 截图方向已正确
        useDocUnwarping: false,            // 数字图片无需矫正
        useChartRecognition: true,         // 开启图表识别，支持树状图/思维导图
    }));

    const jobResponse = await fetch(JOB_URL, {
        method: 'POST',
        headers: { 'Authorization': `bearer ${token}` },
        body: formData,
    });

    if (!jobResponse.ok) {
        const errText = await jobResponse.text();
        console.error('[PaddleOCR] 提交失败:', errText);
        throw new Error(`PaddleOCR 任务提交失败: ${jobResponse.status}`);
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data?.jobId;
    if (!jobId) {
        throw new Error('PaddleOCR 返回数据异常：缺少 jobId');
    }

    console.log(`[PaddleOCR] 任务已提交: ${jobId}，开始轮询...`);

    // 2. 轮询等待任务完成
    const startTime = Date.now();
    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

        const statusResponse = await fetch(`${JOB_URL}/${jobId}`, {
            headers: { 'Authorization': `bearer ${token}` },
        });

        if (!statusResponse.ok) {
            console.warn('[PaddleOCR] 轮询请求失败，重试中...');
            continue;
        }

        const statusData = (await statusResponse.json()).data;
        const state = statusData.state;

        if (state === 'pending') {
            console.log('[PaddleOCR] 状态: 排队中...');
        } else if (state === 'running') {
            const progress = statusData.extractProgress;
            if (progress?.totalPages) {
                console.log(`[PaddleOCR] 状态: 处理中 (${progress.extractedPages}/${progress.totalPages} 页)`);
            } else {
                console.log('[PaddleOCR] 状态: 处理中...');
            }
        } else if (state === 'done') {
            console.log('[PaddleOCR] 任务完成，获取结果...');
            const jsonlUrl = statusData.resultUrl?.jsonUrl;
            if (!jsonlUrl) {
                throw new Error('PaddleOCR 结果 URL 缺失');
            }
            return await fetchPaddleResult(jsonlUrl);
        } else if (state === 'failed') {
            throw new Error(`PaddleOCR 识别失败: ${statusData.errorMsg || '未知错误'}`);
        }
    }

    throw new Error('PaddleOCR 任务超时（超过 5 分钟）');
}

/**
 * 解析 PaddleOCR 的 JSONL 结果，提取所有页面的 Markdown 文本
 */
async function fetchPaddleResult(jsonlUrl: string): Promise<string> {
    const response = await fetch(jsonlUrl);
    if (!response.ok) {
        throw new Error(`获取 PaddleOCR 结果失败: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.trim().split('\n');

    let fullText = '';
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const parsed = JSON.parse(line);
            const results = parsed.result?.layoutParsingResults || [];
            for (const res of results) {
                const markdown = res.markdown?.text || '';
                if (markdown) {
                    fullText += markdown + '\n\n';
                }
            }
        } catch (e) {
            console.warn('[PaddleOCR] 解析结果行失败:', e);
        }
    }

    console.log(`[PaddleOCR] 提取完成，共 ${fullText.length} 字符`);

    // 清理无法访问的临时图片引用（PaddleOCR 返回的图片 URL 是临时链接，浏览器无法访问）
    const cleaned = fullText
        .replace(/!\[.*?\]\(.*?\)/g, '')       // 移除 ![alt](url) 格式
        .replace(/<img[^>]*>/gi, '')            // 移除 <img> 标签
        .replace(/\n{3,}/g, '\n\n')            // 合并多余空行
        .trim();

    return cleaned;
}
