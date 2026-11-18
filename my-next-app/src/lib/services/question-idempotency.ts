/**
 * 题目的「内容指纹」生成器 —— 所有没有上游作业 ID 的导入路径共用这一份实现。
 *
 * 为什么要内容指纹：硬规则 1 要求写操作先定幂等键。粉笔导入有上游的题目 ID
 * （`FenbiQuestion.externalId`）可以直接当键（见 `import-service.ts`），但
 * 管理端手工粘贴导入和 PDF/OCR 导入都没有上游 ID，只能拿"是不是同一道题"本身
 * 当键 —— 这就是内容指纹，属规则 1 允许的兜底，代价是题面被改写后会被当成新题
 * （此时靠「先查后插 + `questions_external_id_unique` 唯一索引」保证同键不重复）。
 *
 * 字段组合：**题干 + 选项 JSON + 答案**。
 *   - 三者共同决定"这道题是什么"，任一变化都应当落成另一道题；
 *   - 解析（explanation）/标签/维度/题型是展示性属性，补解析或改标签不算新题，
 *     把它们算进键会让"同一题的解析被修正"变成重复行；
 *   - 选项用 `JSON.stringify`（数组顺序即语义），因此 `["甲","乙"]` 与 `["乙","甲"]`
 *     是两个键 —— 顺序变了就是选项内容变了，不能合并。
 *
 * 分隔符用 `\u0001`（不出现在题目文本里的控制字符），避免「a|b 与 a」这类
 * 拼接后撞键的问题。
 */
import { createHash } from "crypto";

/** sha1 十六进制取前 36 位，配合各来源的前缀得到定长键（与 pdf 导入既有口径一致） */
const DIGEST_LENGTH = 36;

export function questionContentDigest(
  content: string,
  options: unknown,
  answer: string | null | undefined,
): string {
  const optionsJson = JSON.stringify(options ?? []);
  return createHash("sha1")
    .update(`${content}\u0001${optionsJson}\u0001${answer ?? ""}`)
    .digest("hex")
    .slice(0, DIGEST_LENGTH);
}

/** PDF/OCR 导入的键：`pdf:` 前缀占 4 字符，总长固定 40 字符 */
export function buildPdfExternalId(q: {
  content: string;
  options?: unknown;
  answer?: string | null;
}): string {
  return `pdf:${questionContentDigest(q.content, q.options, q.answer)}`;
}

/**
 * 管理端手工导入（`adminService.importQuestions`）的键：`admin:` 前缀占 6 字符。
 * 前缀与 `pdf:` / 粉笔上游 ID（纯数字或业务串）互不重叠，三类题目的键空间不串味。
 */
export function buildAdminExternalId(q: {
  content?: unknown;
  options?: unknown;
  answer?: unknown;
}): string {
  return `admin:${questionContentDigest(
    typeof q.content === "string" ? q.content : String(q.content ?? ""),
    q.options,
    typeof q.answer === "string" ? q.answer : null,
  )}`;
}

/**
 * 外部 API 建题的键：`api:` 前缀占 4 字符。
 *
 * 与 `admin:` / `pdf:` / 粉笔上游 ID 的键空间互不重叠，所以「同一道题经不同入口
 * 进来」不会被误判成重复——各入口的幂等域是独立的，这是有意的：
 * 外部 agent 建题与人工导入撞车时，宁可多一行让人删，也不要静默合并丢失来源。
 */
export function buildApiExternalId(q: {
  content: string;
  options?: unknown;
  answer?: string | null;
}): string {
  // 不能复用 `questionContentDigest` 的 `\u0001` 拼接：填空题的题干与答案允许出现该
  // 控制字符，不同字段组合可能撞出同一个哈希输入。改成整体 JSON 序列化数组：
  // 每个字段自带边界（引号与转义），不存在"跨字段拼接"的歧义。
  // 既有导入域（admin:/pdf:）的键格式保持不变，避免存量行失配。
  const canonical = JSON.stringify([
    q.content,
    JSON.stringify(q.options ?? []),
    q.answer ?? "",
  ]);
  return `api:${createHash("sha1").update(canonical).digest("hex").slice(0, DIGEST_LENGTH)}`;
}
