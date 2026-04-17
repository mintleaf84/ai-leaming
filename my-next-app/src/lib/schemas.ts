import { z } from 'zod';

// --- Base Schemas ---

const BaseQuestionSchema = z.object({
  content: z.string().min(5, "题干长度至少为5个字符"),
  options: z.array(z.string().min(1, "选项内容不能为空")).min(2, "至少需要2个选项").max(10),
  answer: z.string().min(1, "必须指定正确答案"),
  explanation: z.string().min(5, "解析长度至少为5个字符"),
  tags: z.array(z.string().min(1, "标签内容不能为空")).min(1, "至少需要1个标签"),
  dimension: z.enum(['knowledge', 'understanding', 'application'], {
    message: "维度必须是 'knowledge'、'understanding' 或 'application'"
  }).or(z.string()), // Relax dimension as well just in case
  type: z.string().optional().default('single'), // Relax type to string to support legacy data
});

export const QuestionSchema = BaseQuestionSchema.refine((data) => {
  // 判断题：选项固定为 ["正确", "错误"]，答案只能是 "A" 或 "B"
  if (data.type === 'truefalse') {
    return (data.answer === 'A' || data.answer === 'B') && data.options.length === 2;
  }

  // 通用匹配逻辑：支持内容匹配标号 或 标号匹配内容
  const isMatch = (ans: string) => {
    if (data.options.includes(ans)) return true;
    if (ans.length === 1 && ans >= 'A' && ans <= 'Z') {
      const idx = ans.charCodeAt(0) - 65;
      return !!data.options[idx];
    }
    return false;
  };

  if (data.type === 'multi') {
    try {
      const answers = JSON.parse(data.answer);
      if (!Array.isArray(answers) || answers.length < 1) return false;
      return answers.every(a => isMatch(a));
    } catch {
      return false;
    }
  }
  return isMatch(data.answer);
}, {
  message: "正确答案必须是选项之一或有效的选项标号(A/B/C/D)",
  path: ["answer"]
});

// --- Phase 4 Specific Schemas ---

/**
 * Task 4.1: Correction Quiz (找茬对比题)
 * Requirements: Compare the wrong option with the correct one.
 */
export const CorrectionQuizSchema = z.object({
  analysis: z.string().describe("分析用户错误选项与正确选项的区别"),
  distinctionPoint: z.string().describe("区分这两个概念的核心逻辑点"),
  quiz: z.object({
    content: z.string().describe("针对该核心逻辑点生成的一个辨析题"),
    options: z.array(z.string()),
    answer: z.string(),
    explanation: z.string()
  })
});

/**
 * Task 4.2: Regression Challenge (逻辑逆向/补集测试)
 */
export const RegressionChallengeSchema = z.object({
  logicType: z.enum(['reverse', 'complement', 'boundary']).describe("逆向/补集/边界测试"),
  challenges: z.array(z.object({
    content: z.string(),
    options: z.array(z.string()),
    answer: z.string(),
    explanation: z.string()
  })).length(3) // PRD: 3 questions for recovery
});

export type CorrectionQuiz = z.infer<typeof CorrectionQuizSchema>;
export type RegressionChallenge = z.infer<typeof RegressionChallengeSchema>;

// --- Persistence Schemas (Database Rows) ---

export const PracticeSessionRowSchema = z.object({
  id: z.string(),
  user_id: z.number(),
  session_name: z.string().nullable().optional(),
  total_questions: z.number(),
  correct_count: z.number().default(0),
  review_count: z.number().default(0),
  created_at: z.string().optional(),
  questions_json: z.string().transform((str, ctx) => {
    try {
      if (!str) return [];
      return JSON.parse(str);
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON in questions_json" });
      return [];
    }
  }),
  practice_mode: z.string().nullable().optional(),
});

export const PracticeLogRowSchema = z.object({
  id: z.number(),
  session_id: z.string().nullable(),
  user_id: z.number(),
  question_id: z.number(),
  user_answer: z.string(),
  is_correct: z.number().transform(val => Boolean(val)), // SQLite stores boolean as 0/1
  duration_ms: z.number(),
  timestamp: z.string().optional()
});

// 数据库行 Schema，包含自动 JSON 解析
export const QuestionRowSchema = BaseQuestionSchema.extend({
  id: z.number(), // 数据库都有 ID
  options: z.string().transform((str, ctx): string[] => {
    try {
      const parsed = JSON.parse(str);
      return z.array(z.string()).parse(parsed);
    } catch {
      return [];
    }
  }).or(z.array(z.string())), // 兼容已经是数组的情况（虽然 sqlite 通常返回 string）
  tags: z.string().transform((str, ctx): string[] => {
    try {
      const parsed = JSON.parse(str);
      return z.array(z.string()).parse(parsed);
    } catch {
      return [];
    }
  }).or(z.array(z.string())),
});

export type PracticeSessionRow = z.infer<typeof PracticeSessionRowSchema>;
export type PracticeLogRow = z.infer<typeof PracticeLogRowSchema>;
export type QuestionRow = z.infer<typeof QuestionRowSchema>;
