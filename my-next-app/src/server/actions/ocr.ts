'use server';
import logger from '@/lib/logger';

import { getErrorMessage } from '@/lib/utils/error';
import { performPaddleOCR } from '@/lib/ai/paddle-ocr';
import { performOCR as performSiliconFlowOCR } from '@/lib/ai/siliconflow-ocr';
import { requireUser } from '@/lib/auth/auth';

import { type OcrModel, type OcrModelInfo } from '@/types/ocr';

/** 获取可用的 OCR 模型列表（供前端展示） */
export async function getOcrModelsAction(): Promise<OcrModelInfo[]> {
    return [
        {
            id: 'paddle-ocr',
            name: 'PaddleOCR-VL',
            description: '百度飞桨版式分析引擎，支持图片和 PDF，擅长表格与公式',
            supportedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/bmp'],
        },
        {
            id: 'deepseek-ocr',
            name: 'DeepSeek-OCR',
            description: 'SiliconFlow 大模型 OCR，仅支持 PDF，中文与公式精度极高',
            supportedTypes: ['application/pdf'],
        },
    ];
}

/**
 * OCR 识别 Server Action
 * 接收 Base64 编码的文件数据，根据选择的模型调用对应服务
 */
export async function performOcrAction(
    fileBase64: string,
    fileName: string,
    mimeType: string,
    model: OcrModel = 'paddle-ocr'
): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
        // 鉴权：确保用户已登录
        await requireUser();

        // 校验文件大小（Base64 约为原始大小的 1.33 倍，限制原始文件 10MB）
        const estimatedSize = (fileBase64.length * 3) / 4;
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (estimatedSize > MAX_SIZE) {
            return { success: false, error: '文件过大，请上传 10MB 以内的文件' };
        }

        // 校验文件类型
        const allowedTypes = [
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'image/bmp',
        ];
        if (!allowedTypes.includes(mimeType)) {
            return { success: false, error: `不支持的文件类型: ${mimeType}，请上传 PDF 或图片` };
        }

        // DeepSeek-OCR 仅支持 PDF
        if (model === 'deepseek-ocr' && mimeType !== 'application/pdf') {
            return { success: false, error: 'DeepSeek-OCR 仅支持 PDF 文件，请切换为 PaddleOCR 或上传 PDF' };
        }

        // 将 Base64 转为 Buffer
        const fileBuffer = Buffer.from(fileBase64, 'base64');

        logger.info(`[OCR Action] 开始识别: ${fileName} (${mimeType}, ${Math.round(fileBuffer.length / 1024)}KB, 模型: ${model})`);

        let text: string;

        switch (model) {
            case 'deepseek-ocr':
                text = await performSiliconFlowOCR(fileBuffer);
                break;
            case 'paddle-ocr':
            default:
                text = await performPaddleOCR(fileBuffer, fileName, mimeType);
                break;
        }

        if (!text || text.trim().length === 0) {
            return { success: false, error: '未能识别出任何文本内容，请检查文件是否包含可识别的文字' };
        }

        logger.info(`[OCR Action] 识别完成: ${text.length} 字符`);
        return { success: true, text };
    } catch (error: unknown) {
        logger.error({ err: error }, '[OCR Action] 识别失败');
        return {
            success: false,
            error: getErrorMessage(error, 'OCR 识别失败，请稍后重试'),
        };
    }
}
