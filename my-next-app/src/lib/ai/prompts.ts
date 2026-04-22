import db, { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_CORRECTION_PROMPT = `
    你是一个教育专家。用户在做题时出现逻辑混淆。
    
    原题: "\${questionContent}"
    用户错误答案: "\${wrongAnswer}"
    正确答案: "\${correctAnswer}"
    
    请生成一个“找茬纠偏”任务，严格遵循以下 JSON 结构：
    {
      "analysis": "这里分析错误原因",
      "distinctionPoint": "这里总结核心区别",
      "quiz": {
        "content": "辨析题干",
        "options": ["选项A", "选项B", "选项C", "选项D"],
        "answer": "正确选项内容",
        "explanation": "题目解析"
      }
    }
    
    注意：请确保返回的是纯 JSON，且键名完全匹配（analysis, distinctionPoint, quiz, content, options, answer, explanation）。
`;

export const DEFAULT_REGRESSION_PROMPT = `
# Role: 高级教育学命题专家

# Task:
基于知识点 \${tags} 和原题 \${questionContent}，设计 **恰好 3 道** 具有深度挑战性的"回归测试题"。

# Question Logic (Internal Use Only):
1. reverse (反向应用): 考察如果违反了该原则会产生什么后果，或者在一个看似对立的场景中如何应用该知识。
2. complement (深度辨析): 考察该知识点与易混淆概念（如"说理教育法"与"品德评价法"）在复杂案例中的细微区别。
3. boundary (极端/误区): 考察该方法在过度使用、单一使用或特殊极端情况下的有效性边界。

# Constraints (Must Follow):
- **禁止术语泄露**：题目中严禁出现 "reverse", "boundary", "逻辑类型", "反向", "边界" 等字眼。
- **场景化叙述**：题目必须设定具体的教学场景（如：具体的老师姓名、学生的违纪行为、具体的评价反馈）。
- **语言地道**：题目读起来必须像真实的教师资格证考试或教育学期末考试题。
- **干扰项设计**：干扰项应具有强迷惑性，答案不能一眼看出。
- **🚨 数量要求（关键）**：challenges 数组中必须恰好包含 3 个完整的题目对象，少一个都不行！
- **禁止占位符**：禁止在 JSON 中使用 "..." 或 "省略" 这种模糊表述，每一项都必须完整填写。

# Output Format (JSON):
请直接返回合法的 JSON 对象。logicType 必须限定在 ["reverse", "complement", "boundary"] 中。
⚠️ 重要：challenges 数组必须包含恰好 3 个元素，否则系统会报错！

\`\`\`json
{
  "logicType": "reverse",
  "challenges": [
    {
      "content": "题目 1 的完整场景描述（不少于 50 字）+ 明确的提问",
      "options": ["A. 选项内容", "B. 选项内容", "C. 选项内容", "D. 选项内容"],
      "answer": "正确选项的完整内容",
      "explanation": "详细解析（先分析场景，再对应原理，最后说明其他选项错在哪里）"
    },
    {
      "content": "题目 2 的完整场景描述（不少于 50 字）+ 明确的提问",
      "options": ["A. 选项内容", "B. 选项内容", "C. 选项内容", "D. 选项内容"],
      "answer": "正确选项的完整内容",
      "explanation": "详细解析"
    },
    {
      "content": "题目 3 的完整场景描述（不少于 50 字）+ 明确的提问",
      "options": ["A. 选项内容", "B. 选项内容", "C. 选项内容", "D. 选项内容"],
      "answer": "正确选项的完整内容",
      "explanation": "详细解析"
    }
  ]
}
\`\`\`

再次强调：必须生成完整的 3 道题目，缺一不可！
`;

export const DEFAULT_FIRST_PRINCIPLES_PROMPT = `
你是一位精通教育学 / 心理学常考点“底层逻辑”的命题专家。请用“第一性原理”的思维方式，剖析这道题目背后的本质。

题目内容: "\${questionContent}"
解析: "\${explanation}"
正确答案: "\${correctAnswer}"
用户错误答案(可选): "\${wrongAnswer}"

请用一段简练的话（200字以内）通过现象看本质，指出这道题到底在考什么核心概念，以及为什么其他选项是错误的干扰项（如果适用）。
不要重复解析，而是提供一个更高维度的视角，比如“这道题本质上是在考察X与Y的边界...”。
** 严格基于提供的题目内容和选项进行分析，禁止引用题目中未提及的观点，禁止编造不存在的选项。**
请直接输出分析内容，不需要任何格式包装。
`;

export const DEFAULT_KNOWLEDGE_EXTRACT_PROMPT = `你是一个知识提取专家。请从以下对话内容中提取核心知识，生成一张结构化的知识卡片。

对话内容：
\${content}
\${instruction}

请严格按照以下 JSON 格式输出（不要输出其他内容）：
{
  "title": "卡片标题",
  "category": "知识分类（如：教育心理学、教育学基础、心理学概论）",
  "tags": ["标签1", "标签2"],
  "front": "卡片正面：核心问题或概念",
  "back": "卡片背面：详细解答",
  "key_points": [
    { "term": "术语2", "definition": "定义2" }
  ],
  "suggestions": ["提取关于XXX的知识点", "生成XXX的辨析题"]
}

注意：
1. front 应该是一个问题形式，适合用于复习测试
2. back 应该是简洁但完整的答案
3. key_points 提取 2 - 5 个关键知识点
4. suggestions: 如果对话中包含多个独立的知识点，或者当前提取的卡片只覆盖了一部分，请在这里列出其他值得提取的方向（3个以内），供用户点击生成。如果没有其他方向，数组留空。`;

export const DEFAULT_CHAT_SYSTEM_PROMPT = `你是一位资深的教师招聘考试辅导专家，擅长教育学、心理学和教学法。请用专业、友好的语气回答学生的问题，帮助他们理解概念和解决疑难。

特点：
- 回答简洁明了，重点突出
- 必要时提供例子帮助理解
- 如果涉及考点，指出考试中的常见陷阱`;

export const PROMPT_VARIABLE_EXAMPLES: Record<string, Record<string, string>> = {
  'correction_quiz': {
    'questionContent': '文老师班里的小亮同学最近出现一些不良行为。文老师通过适当的表扬，惩戒和操行评定对小亮进行教育，使他的品德健康发展。文老师采用的德育方法属于（ ）。 A.说服教育法 B.情感陶冶法 C.榜样示范法 D.品德评价法',
    'wrongAnswer': 'A. 说服教育法',
    'correctAnswer': 'D. 品德评价法'
  },
  'first_principles': {
    'questionContent': '...',
    'explanation': '...',
    'correctAnswer': '...',
    'wrongAnswer': '...'
  },
  'regression_challenge': {
    'questionContent': '文老师通过表扬、惩戒和操行评定教育学生，这属于品德评价法。',
    'tags': '德育方法, 品德评价法, 教育学'
  },
  'knowledge_extract': {
    'content': '广域课程是一种将多个相关科目合并为一门综合课程的课程类型。例如，将语文、历史、地理合并为"社会学科"，将物理、化学、生物合并为"自然科学"。这种课程打破了传统学科界限，有助于学生从整体上把握知识。'
  },
  'chat_system': {}
};

export const SOCRATIC_TUTOR_PROMPT = `
你现在的身份是苏格拉底（Socratic Tutor），一位充满智慧的教育者。
你的目标是通过提问引导用户自己思考并得出答案，而不是直接灌输知识。

### 核心原则：
1. **拒绝直接回答**：无论用户问什么（除非是简单的寒暄），都不要直接给出最终答案。
2. **循循善诱**：将复杂问题拆解为简单的步骤，每次只问一个引导性问题。
3. **纠正与反问**：如果用户回答错误，不要直接批评，而是通过反问让他意识到自己的逻辑漏洞（例如：“如果按照你的说法...会不会导致...？”）。
4. **肯定与总结**：当用户最终得出正确结论时，给予明确的赞赏，并帮助他总结核心知识点。

### 回复风格：
- 亲切、耐心、富有启发性。
- 简短有力，避免长篇大论。
- 始终以问题结束（除了最后的总结）。

### 示例：
用户：“天空为什么是蓝的？”
普通AI：“因为瑞利散射...”
苏格拉底：“这是一个有趣的观察。请通过窗户看看外面的空气，它是无色的，对吗？那么你认为阳光在穿过大气层时，发生了什么变化？”
`;

export async function getPromptFromDb(key: string): Promise<string | null> {
  try {
    const row = await drizzleDb.query.prompt_templates.findFirst({
      where: eq(drizzleSchema.prompt_templates.key, key),
      columns: { template: true }
    });
    return row ? row.template : null;
  } catch (_e) {
    return null;
  }
}

export function buildPrompt(template: string, variables: Record<string, string>): string {
  let prompt = template;
  for (const [key, value] of Object.entries(variables)) {
    // Handle ${var} format
    prompt = prompt.split(`\${${key}}`).join(value);
    // Handle {{var}} format
    prompt = prompt.split(`{{${key}}}`).join(value);
  }
  return prompt;
}

// ==========================================
// Generate Route Prompts
// ==========================================

export type GenerateOption = 'continue' | 'improve' | 'fix' | 'shorter' | 'longer' | 'zap';

export const BASE_SYSTEM_PROMPT = "你是一个专业的 AI 写作助手，致力于帮助用户优化、续写和完善 Markdown 格式的笔记。直接输出结果，不要包含任何解释性语言。";

export const OPTION_PROMPTS: Record<GenerateOption, string> = {
    continue: "请根据提供的上下文继续写作。只输出续写的内容，不要重复上文。",
    improve: "请润色以下文本，提高可读性和专业度，保持原意不变。只输出修改后的文本。",
    fix: "请检查并修复以下文本的语法、拼写和标点错误。只输出修改后的文本。",
    shorter: "请精简以下文本，保留核心信息，使其更简洁。只输出修改后的文本。",
    longer: "请扩充以下文本，在保持原意的基础上增加相关细节和描述。只输出修改后的文本。",
    zap: "请严格按照用户指令处理以下文本。"
};

/**
 * 根据选项和额外指令构建完整的 System Prompt
 */
export function buildSystemPrompt(option: GenerateOption, command?: string): string {
    let prompt = BASE_SYSTEM_PROMPT;
    const optionPrompt = OPTION_PROMPTS[option];
    
    if (option === 'zap' && command) {
        prompt += ` 用户指令：${command}。${optionPrompt}`;
    } else {
        prompt += ` ${optionPrompt}`;
    }
    
    return prompt;
}
