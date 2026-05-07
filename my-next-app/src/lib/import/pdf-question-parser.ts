/**
 * PDF OCR 文本 → 结构化题目解析器
 * 使用 AI 将 OCR 识别的文本转换为结构化题目数据
 */

import { z } from 'zod';
import { generateStructuredData, generateTextWrapper } from '@/lib/ai/client';
import { extractJson } from '@/lib/ai/parser';
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

const SYSTEM_PROMPT = `你是教育考试题目解析专家。从文本中提取所有客观题（单选/多选/判断），输出 JSON。

字段名（严格遵守，不可替换）：content, options, type, answer, explanation, confidence, tags

规则：
- options 数组不含 A/B/C/D 前缀
- type: single/multi/truefalse
- answer: 如 "A" 或 "A,C"
- explanation: 50-150字，含正确选项依据和错误选项错因
- confidence: 0-100
- tags: 知识点标签数组
- 判断题 options 为空数组，answer 为 "A"(正确) 或 "B"(错误)
- 题干未明确多选但有2个以上正确答案时标记为 multi
- 无法判断答案时选第一个选项，confidence < 20
- 非题目内容直接跳过，返回空数组比错误数据好

输出格式：仅返回 {"questions":[...],"parseWarnings":[]} JSON，不要任何解释或分析过程。`;

const CHUNK_PROMPT = `请从以下 OCR 识别的文本中提取所有客观题（含单选、多选、判断题）。

\`\`\`
{ocrText}
\`\`\`

严格按 JSON schema 返回，字段名必须为：content, options, type, answer, explanation, confidence, tags。不要使用 question/analysis/knowledgeLabels 等替代字段名。

重要：不要输出任何分析过程、推理步骤或解释文字。直接返回 JSON 对象，不要包含 <think> 标签或任何非 JSON 内容。`;

/** 将单个文本块解析为题目数组（内部） */
async function parseChunk(ocrText: string): Promise<ParsedPdfQuestion[]> {
  const prompt = `${SYSTEM_PROMPT}\n\n${CHUNK_PROMPT.replace('{ocrText}', ocrText)}`;

  // generateTextWrapper 内部已有 withRetry，这里不再额外重试
  const { text } = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
    timeout: 120_000,
    retries: 0,
  });

  const parsed = extractJson(text) as Record<string, unknown>;
  const rawQuestions = Array.isArray(parsed?.questions)
    ? parsed.questions as Record<string, unknown>[]
    : [];

  const normalized = rawQuestions.map(normalizeQuestionFields);
  const result = parsedQuestionSchema.shape.questions.parse(normalized);

  return result;
}

/**
 * 规范化 AI 返回的字段名（兼容模式下 AI 经常使用非标准字段名）
 */
function normalizeQuestionFields(raw: Record<string, unknown>): Record<string, unknown> {
  const fieldMap: Record<string, string> = {
    question: 'content',
    title: 'content',
    stem: 'content',
    analysis: 'explanation',
    explanation_text: 'explanation',
    knowledgeTags: 'tags',
    knowledge_tags: 'tags',
    knowledgeLabels: 'tags',
    labels: 'tags',
    topicTags: 'tags',
  };

  for (const [from, to] of Object.entries(fieldMap)) {
    if (from in raw && !(to in raw)) {
      raw[to] = raw[from];
      delete raw[from];
    }
  }

  // 移除不在 schema 中的额外字段
  const allowedKeys = new Set(['content', 'options', 'type', 'answer', 'explanation', 'confidence', 'tags']);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) delete raw[key];
  }

  return raw;
}

/** 解析单个文本块并校验，供并发调用 */
export async function parseSingleChunk(ocrText: string): Promise<ParsedPdfQuestion[]> {
  // parseChunk 内部 generateTextWrapper 已有重试机制，这里不再额外重试
  const result = await parseChunk(ocrText);
  return validateQuestions(result);
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
