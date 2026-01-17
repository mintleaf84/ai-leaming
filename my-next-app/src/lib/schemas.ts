import { z } from 'zod';

// --- Base Schemas ---

export const QuestionSchema = z.object({
  content: z.string().min(5, "题干长度至少为5个字符"),
  options: z.array(z.string().min(1, "选项内容不能为空")).min(2, "至少需要2个选项").max(10),
  answer: z.string().min(1, "必须指定正确答案"),
  explanation: z.string().min(5, "解析长度至少为5个字符"),
  tags: z.array(z.string().min(1, "标签内容不能为空")).min(1, "至少需要1个标签"),
  dimension: z.enum(['knowledge', 'understanding', 'application'], {
    message: "维度必须是 'knowledge'、'understanding' 或 'application'"
  }),
  type: z.enum(['single', 'multi']).optional().default('single'),
}).refine((data) => {
  // 验证答案是否在选项中
  if (data.type === 'multi') {
    try {
      const answers = JSON.parse(data.answer);
      if (!Array.isArray(answers) || answers.length < 1) return false;
      return answers.every(a => data.options.includes(a));
    } catch {
      return false; // JSON 解析失败
    }
  }
  return data.options.includes(data.answer);
}, {
  message: "正确答案（或所有多选答案）必须包含在选项列表中",
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
