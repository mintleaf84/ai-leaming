/**
 * 判分用的文本归一化（规格 §2.1）。
 *
 * 只做三件事，且顺序固定：
 * 1. **全角 → 半角**：ASCII 全角区段（U+FF01–U+FF5E）与全角空格 U+3000；
 * 2. **去标点**：Unicode `\p{P}`（中英文标点都在这一类：，。、；：！？「」（）《》…）；
 * 3. **折叠空白**：连续空白压成一个空格，再去首尾。
 * 最后统一小写，让「忽略大小写」这条规则只实现一次。
 *
 * 有意**不做**的事（都要额外依赖或基准集，本轮不做）：
 * - 拼音化 / 繁简转换（规格把 `verbatim` 卡的拼音容错划到 v2，见 types.ts 头注释）；
 * - 同义词、模糊匹配、编辑距离——判分必须可复现、可单测。
 *
 * 为什么保留单个空格而不是全删：规格写的是"去首尾/连续空白"。全删会让
 * 「安全 制度」这种用户手打的间隔直接蒙中关键词，属于把误判风险转嫁给判分。
 */

const FULLWIDTH_ASCII_START = 0xff01;
const FULLWIDTH_ASCII_END = 0xff5e;
const FULLWIDTH_ASCII_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;

/**
 * 全角 ASCII 转半角（含全角空格转普通空格）。
 *
 * 用 `for…of` 遍历**码点**而不是 `charAt` 遍历 UTF-16 单元：代理对字符（emoji 等）
 * 被 `charAt` 拆开后会变成两个孤立半代理，输出会损坏。
 */
export function toHalfWidth(input: string): string {
  if (!input) return "";
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code === IDEOGRAPHIC_SPACE) {
      out += " ";
      continue;
    }
    if (code >= FULLWIDTH_ASCII_START && code <= FULLWIDTH_ASCII_END) {
      out += String.fromCharCode(code - FULLWIDTH_ASCII_OFFSET);
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * 去标点（导出给单测，也用于"只想去标点、不想动空白"的调用点）。
 *
 * 只删 `\p{P}`，不删 `\p{S}`：`+ - = ° ％` 这类符号在部分学科内容里是语义的一部分，
 * 一起删会把「A+B」和「AB」判成同一个答案。
 */
export function stripPunctuation(input: string): string {
  if (!input) return "";
  return input.replace(/\p{P}/gu, "");
}

/** 判分统一入口：全角转半角 → 去标点 → 折叠空白 → 小写。 */
export function normalizeText(input: string): string {
  if (!input) return "";
  return stripPunctuation(toHalfWidth(input))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
