/**
 * PDF OCR 文本 → 结构化题目解析器
 * 使用 AI 将 OCR 识别的文本转换为结构化题目数据
 */

import { z } from 'zod';
import { generateStructuredData } from '@/lib/ai/client';
import type { ParsedPdfQuestion, ParsedPdfResult } from '@/types/pdf-import';

// Zod schema for AI structured output
const parsedQuestionSchema = z.object({
  questions: z.array(z.object({
    content: z.string().describe('题干文本'),
    options: z.array(z.string()).describe('选项数组，不含 A/B/C/D 前缀'),
    type: z.enum(['single', 'multi']).describe('single=单选, multi=多选'),
    answer: z.string().describe('正确答案，如 "A" 或 "A,C"'),
    explanation: z.string().describe('解析说明'),
    confidence: z.number().min(0).max(100).describe('AI 推断答案的置信度 0-100'),
    tags: z.array(z.string()).describe('知识点标签'),
  })),
  parseWarnings: z.array(z.string()).describe('解析过程中的警告信息'),
});

/** 清理 OCR 文本中的噪声字符 */
export function cleanOcrText(text: string): string {
  return text
    // 先规范化引号（在噪声剥离之前，否则 Unicode 引号会被移除）
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // 移除常见 OCR 噪声
    .replace(/[^一-龥a-zA-Z0-9\s，。、；：？！""''（）【】《》\-_.,:;?!()\[\]<>\/\\'"@#$%^&*+=|~`]/g, '')
    // 规范化空白
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 按题号分割文本为独立题目块 */
export function splitIntoQuestionChunks(text: string, maxChunkSize = 6000): string[] {
  // 匹配题号模式：1. / 1、 / 1） / 第1题 / (1)
  const questionPattern = /(?:^|\n)(?=\d+[.、）)]\s|(?:第\s*)?\d+\s*题)/;
  const segments = text.split(questionPattern).filter(s => s.trim());

  if (segments.length <= 1) {
    // 无法按题号分割，按字符数分块
    return splitBySize(text, maxChunkSize);
  }

  // 合并小段到 chunk 上限
  const chunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (current.length + seg.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = seg;
    } else {
      current += seg;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function splitBySize(text: string, size: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > size && current.length > 0) {
      chunks.push(current.trim());
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

const SYSTEM_PROMPT = `你是一位教育考试题目解析专家。请从 OCR 识别的文本中提取所有选择题，并为每道题推断正确答案。

## 任务
1. 识别文本中的每一道题目（选择题或多选题）
2. 提取题干、选项（去除 A/B/C/D 等字母前缀）
3. 根据题目内容和选项逻辑，推断最可能的正确答案
4. 为每道题生成简要解析
5. 标注知识点标签
6. 对无法确定答案的题目，降低置信度

## 多选题判断
- 明确标注"多选"的为 multi 类型
- 选项中有多个合理答案的也标记为 multi
- 通常 A 型题为单选，X 型题为多选

## 答案推断原则
- 选择最长最详细的选项（通常是正确答案的特征）
- 排除明显错误的选项
- 如果完全无法判断，设为第一个选项并降低 confidence 到 20 以下

## 注意事项
- OCR 文本可能有识别错误，尝试修正明显错误
- 如果某个段落不是题目，跳过它
- 返回空数组比返回错误数据好`;

const CHUNK_PROMPT = `请从以下 OCR 识别的文本中提取所有选择题。文本可能来自扫描件，存在一些识别错误，请尽量修正。

\`\`\`
{ocrText}
\`\`\`

请按要求提取题目，返回 JSON 格式。`;

/** 将单个文本块解析为题目数组 */
async function parseChunk(ocrText: string): Promise<ParsedPdfQuestion[]> {
  const prompt = `${SYSTEM_PROMPT}\n\n${CHUNK_PROMPT.replace('{ocrText}', ocrText)}`;

  const result = await generateStructuredData(parsedQuestionSchema, prompt, 'economy', {
    timeout: 120000, // 2 分钟超时，PDF 解析可能较慢
    retries: 2,
  });

  return result.questions;
}

/** 合并多块解析结果，去重 */
function mergeResults(chunkResults: ParsedPdfQuestion[][]): ParsedPdfQuestion[] {
  const merged: ParsedPdfQuestion[] = [];
  const seen = new Set<string>();

  for (const chunk of chunkResults) {
    for (const q of chunk) {
      // 用题干前 50 字符作为去重 key
      const key = q.content.slice(0, 50).replace(/\s/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(q);
      }
    }
  }

  return merged;
}

/**
 * 主入口：将 OCR 文本解析为结构化题目
 * @param ocrText - OCR 识别的原始文本
 * @param onProgress - 进度回调 (current, total)
 */
export async function parseOcrTextToQuestions(
  ocrText: string,
  onProgress?: (stage: string, current: number, total: number) => void,
): Promise<ParsedPdfResult> {
  const cleaned = cleanOcrText(ocrText);

  if (cleaned.length < 20) {
    return { questions: [], parseWarnings: ['OCR 文本过短，无法识别题目'] };
  }

  const chunks = splitIntoQuestionChunks(cleaned);
  const warnings: string[] = [];

  onProgress?.('ai_parse', 0, chunks.length);

  const chunkResults: ParsedPdfQuestion[][] = [];

  // 逐块解析（避免并发过多导致超时）
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.('ai_parse', i + 1, chunks.length);
    try {
      const result = await parseChunk(chunks[i]);
      chunkResults.push(result);
    } catch (err) {
      const msg = `第 ${i + 1} 块解析失败: ${err instanceof Error ? err.message : String(err)}`;
      warnings.push(msg);
      console.error('[PdfParser]', msg);
    }
  }

  const questions = mergeResults(chunkResults);

  if (questions.length === 0 && warnings.length === 0) {
    warnings.push('未能从文本中识别出任何题目');
  }

  return { questions, parseWarnings: warnings };
}
