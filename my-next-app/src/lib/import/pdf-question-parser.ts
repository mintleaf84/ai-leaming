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
    type: z.enum(['single', 'multi', 'truefalse']).describe('single=单选, multi=多选, truefalse=判断题'),
    answer: z.string().describe('正确答案，如 "A" 或 "A,C"'),
    explanation: z.string().describe('解析说明'),
    confidence: z.number().min(0).max(100).describe('AI 推断答案的置信度 0-100'),
    tags: z.array(z.string()).describe('知识点标签'),
  })),
  parseWarnings: z.array(z.string()).describe('解析过程中的警告信息'),
});

/** 规范化空白，保留全部内容 */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 按题号分割文本为独立题目块，每块合并 questionsPerChunk 道题 */
export function splitIntoQuestionChunks(text: string, questionsPerChunk = 5): string[] {
  // 匹配题号模式：第1题 / 第 1 题 / 1. / 1、 / 1） / (1)
  const questionPattern = /(?:^|\n)(?=(?:第\s*\d+\s*题)|\d+[.、）)]\s)/;
  const segments = text.split(questionPattern).filter(s => s.trim());

  if (segments.length <= 1) {
    // 无法按题号分割，按字符数分块
    return splitBySize(text, 1500);
  }

  // 按 questionsPerChunk 题合并为一块
  const chunks: string[] = [];
  for (let i = 0; i < segments.length; i += questionsPerChunk) {
    const batch = segments.slice(i, i + questionsPerChunk);
    const chunk = batch.join('').trim();
    if (chunk) chunks.push(chunk);
  }

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

const SYSTEM_PROMPT = `你是一位教育考试题目解析专家。请从 OCR 识别的文本中提取所有客观题，并为每道题推断正确答案。

## 任务
1. 识别文本中的所有客观题，包含单选题、多选题和判断题
2. 提取题干、选项（去除 A/B/C/D 等字母前缀）
3. 根据题目内容和选项逻辑，推断最可能的正确答案
4. 为每道题生成简要解析：内容需包含正确选项的考点依据、错误选项的错因分析，字数控制在50-150字，表述简洁准确
5. 标注知识点标签
6. 对无法确定答案的题目，按照以下标准设置置信度：置信度取值范围为0-100，完全确定答案正确（考点清晰无歧义）设为90-100；存在较小干扰项但答案可明确判定设为70-89；考点模糊或存在多个疑似正确选项但可锁定最优解设为40-69；完全无法判断设为20以下

## 题型判断（规则优先级从高到低）
- 判断题：没有选项的题目，或题干要求判断"正确/错误"、"对/错"，type 设为 truefalse，options 设为空数组 []，answer 为 "A"（正确/对）或 "B"（错误/错）
- 明确标注"多选"的为 multi 类型
- 题干未明确标注题型，但选项中有2个及以上符合知识点定义的正确答案的，标记为multi类型
- 通常 A 型题为单选，X 型题为多选
- 其余为 single 类型

## 答案推断原则（优先级从高到低）
- 第一优先级：结合学科知识点和题目逻辑，推断最匹配的正确答案，排除明显违背知识点的错误选项
- 第二优先级：当多个选项知识点逻辑相近无法明确排除时，可参考"最长最详细的选项通常为正确答案"的特征辅助判断
- 如果完全无法判断，设为第一个选项并降低 confidence 到 20 以下

## 注意事项
- 如果某个段落不是题目，跳过它
- 返回空数组比返回错误数据好
- parseWarnings字段仅填写解析过程中的异常信息，包括OCR识别乱码、题干内容残缺、题型无法判定、答案存在争议四类场景，无异常则为空数组`;

const CHUNK_PROMPT = `请从以下 OCR 识别的文本中提取所有客观题（含单选、多选、判断题）。

\`\`\`
{ocrText}
\`\`\`

请按要求提取题目，返回 JSON 格式。`;

/** 将单个文本块解析为题目数组（内部） */
async function parseChunk(ocrText: string): Promise<ParsedPdfQuestion[]> {
  const prompt = `${SYSTEM_PROMPT}\n\n${CHUNK_PROMPT.replace('{ocrText}', ocrText)}`;

  const result = await generateStructuredData(parsedQuestionSchema, prompt, 'economy', {
    timeout: 300_000, // 5 分钟超时，5 道题约 1.5 分钟
    retries: 2,
  });

  return result.questions;
}

/** 解析单个文本块并校验，供并发调用 */
export async function parseSingleChunk(ocrText: string): Promise<ParsedPdfQuestion[]> {
  try {
    const result = await parseChunk(ocrText);
    return validateQuestions(result);
  } catch (err) {
    // 重试一次
    console.warn('[PdfParser] 单块首次失败，重试中...');
    try {
      const result = await parseChunk(ocrText);
      return validateQuestions(result);
    } catch (retryErr) {
      console.error('[PdfParser] 单块重试失败:', retryErr);
      throw retryErr;
    }
  }
}

/** 校验并过滤 AI 解析结果中的无效题目 */
export function validateQuestions(questions: ParsedPdfQuestion[]): ParsedPdfQuestion[] {
  const answerPattern = /^[A-Z](,[A-Z])*$/;

  return questions.filter((q) => {
    if (q.content.trim().length < 5) return false;
    if (!q.options || (q.options.length === 0 && q.type !== 'truefalse')) return false;
    // 判断题自动补全选项
    if (q.type === 'truefalse' && (!q.options || q.options.length === 0)) {
      q.options = ['正确', '错误'];
    }
    if (!answerPattern.test(q.answer)) {
      const match = q.answer.match(/[A-Z]/g);
      if (match) {
        q.answer = match.join(',');
      } else {
        return false;
      }
    }
    q.confidence = Math.max(0, Math.min(100, q.confidence));
    return true;
  });
}

/** 合并多块解析结果，去重 */
function mergeResults(chunkResults: ParsedPdfQuestion[][]): ParsedPdfQuestion[] {
  const merged: ParsedPdfQuestion[] = [];
  const seen = new Set<string>();

  for (const chunk of chunkResults) {
    for (const q of chunk) {
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
      const validated = validateQuestions(result);
      if (validated.length > 0) {
        chunkResults.push(validated);
      }
    } catch (err) {
      // 失败时重试一次
      try {
        console.warn(`[PdfParser] 第 ${i + 1} 块首次失败，重试中...`);
        const result = await parseChunk(chunks[i]);
        const validated = validateQuestions(result);
        if (validated.length > 0) {
          chunkResults.push(validated);
        }
      } catch (retryErr) {
        const msg = `第 ${i + 1} 块解析失败: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`;
        warnings.push(msg);
        console.error('[PdfParser]', msg);
      }
    }
  }

  const questions = mergeResults(chunkResults);

  if (questions.length === 0 && warnings.length === 0) {
    warnings.push('未能从文本中识别出任何题目');
  }

  return { questions, parseWarnings: warnings };
}
