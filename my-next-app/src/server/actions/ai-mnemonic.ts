"use server";

import logger from "@/lib/logger";
import { requireUser } from "@/lib/auth/auth";
import { generateTextWrapper } from "@/lib/ai/client";
import { checkAndConsumeQuota } from "@/lib/billing/subscription-service";
import { questionService } from "@/lib/services/question";

/**
 * 为题目生成 AI 助记词
 */
export async function generateMnemonicAction(
  questionId: string,
  forceRegenerate = false,
) {
  try {
    const user = await requireUser();
    const idNum = parseInt(questionId, 10);

    // 1. 获取题目核心信息
    const question = await questionService.getById(idNum);

    if (!question) {
      return { success: false, message: "题目不存在" };
    }

    // 2. 检查缓存 (除非强制重新生成)
    if (question.ai_mnemonic && !forceRegenerate) {
      return { success: true, content: question.ai_mnemonic, cached: true };
    }

    // 3. 配额检查
    const userIdNum =
      typeof user.id === "string" ? parseInt(user.id, 10) : user.id;
    if (isNaN(userIdNum)) {
      return { success: false, message: "无效的用户 ID" };
    }

    const quotaResult = await checkAndConsumeQuota(userIdNum, "mnemonic");
    if (!quotaResult.allowed) {
      return {
        success: false,
        message:
          quotaResult.message ||
          "今日记忆大师使用次数已用完，请升级套餐解锁更多。",
      };
    }

    // 4. 构建助记词 Prompt
    const prompt = `
# Role
你是一位顶级记忆大师，将枯燥的教育学、心理学理论转化为**过目不忘、甚至有点“洗脑”**的记忆钩子。

# Task
请针对用户提供的【知识点】，设计出比死记硬背高效的辅助记忆内容。只需要记忆选出正确答案的最小知识点。

# Principles
1. 拒绝学术腔：严禁直接堆砌首字。必须翻译成生活化的“人话”或热门梗。
2. 尽量避免口诀里出现过多的原词或缩写！
3. 优先寻找谐音，借用名人名字、热梗、广告词或生活常用语。
4. 严禁只取每个词的首字凑成一段没意义的话

# example
1. 绅士的洛克在白板上画漫画（洛克、《教育漫话》、白板说、绅士教育）
2. 人颁布，鬼实施，资本主义男女丑，戌美六三三。（壬寅学制，首次颁布，但未实施）、（癸卯学制，首个正式颁布并实施）、（壬子癸丑学制，男女同校，资本主义性质）、（壬戌学制，模仿美国，六三三学制）
3. 斯宾塞准备生活 （斯宾塞准备生活说）

# Input (在此输入知识点)
- 题目内容: ${question.content}
- 选项: ${JSON.stringify(question.options) || "无"}
- 正确答案: ${question.answer}
- 解析: ${question.explanation || "无"}
- 标签: ${JSON.stringify(question.tags) || "无"}

# Output Format
请直接输出 Markdown 内容，不要包含任何其他废话。格式如下：

### 🚀 记忆口诀
[口诀内容]

### 💡 记忆逻辑
[简单拆解对应关系]

### 🖼️ 脑海画面（如果有的话）
[描述那个让你忘不掉的场景]
`;

    // 5. 调用 AI 生成
    const { text } = await generateTextWrapper(prompt, "premium");

    // 6. 通过 Service 保存
    await questionService.updateMnemonic(idNum, text);

    return { success: true, content: text, cached: false };
  } catch (error) {
    logger.error({ err: error }, "[generateMnemonicAction] Error");
    return { success: false, message: "生成失败，请稍后重试" };
  }
}
