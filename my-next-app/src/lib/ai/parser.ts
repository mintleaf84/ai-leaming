/**
 * AI 响应内容解析与清洗工具
 */

/**
 * 健壮的 JSON 提取工具 (借鉴自 Cherry Studio)
 * 处理 Markdown 代码块、DeepSeek <think> 标签以及常见的非法控制字符
 */
export function extractJson(text: string): unknown {
  // 1. 移除 DeepSeek 等模型的 <think> 标签内容
  const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // 2. 尝试正则匹配 Markdown 代码块中的 JSON
  const jsonBlockMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const targetText = jsonBlockMatch ? jsonBlockMatch[1] : cleanedText;

  try {
    // 3. 直接解析 (处理可能的非法控制字符)
    const normalizedText = targetText.replace(
      /[\u0000-\u001F\u007F-\u009F]/g,
      "",
    );
    return JSON.parse(normalizedText);
  } catch (_e) {
    // 4. 极致兜底：尝试寻找第一个 { 和最后一个 }
    const firstBrace = targetText.indexOf("{");
    const lastBrace = targetText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        const braceText = targetText
          .substring(firstBrace, lastBrace + 1)
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
        return JSON.parse(braceText);
      } catch (_innerError) {
        throw new Error("无法从响应中提取有效的 JSON 格式");
      }
    }
    throw new Error("无法从响应中提取有效的 JSON 格式");
  }
}

/**
 * 自动修复可能的嵌套结构
 * 有些模型会多包一层 key（如 { "result": { ... } }）
 */
export function autoUnpackNestedJson(
  parsed: Record<string, unknown>,
  expectedKeys: string[],
): Record<string, unknown> {
  const keys = Object.keys(parsed);
  // 如果解析出来的对象只有一个 key，且这个 key 不是预期的 key 之一，且值是对象
  if (
    keys.length === 1 &&
    !expectedKeys.includes(keys[0]) &&
    typeof parsed[keys[0]] === "object"
  ) {
    return parsed[keys[0]] as Record<string, unknown>;
  }
  return parsed;
}
