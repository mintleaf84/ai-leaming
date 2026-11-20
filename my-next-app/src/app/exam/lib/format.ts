/**
 * 试卷页面的展示格式化：分数、用时、试卷类型、题目类型。
 * 只做"值 → 中文短句"，不做判断（判断在 `answer-sheet.ts` / `submit.ts`）。
 */
import { safeParseJson } from "@/lib/utils/json";
import type { ExamPaper } from "./types";

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  single: "单项选择",
  multi: "多项选择",
  truefalse: "判断",
  fill_blank: "填空",
  essay: "简答",
  short_answer: "简答",
};

export function questionTypeLabel(type: string | null | undefined): string {
  if (!type) return "题目";
  return QUESTION_TYPE_LABELS[type] ?? type;
}

/** 0~1 的比例 → 85 分（整数，四舍五入）；缺省为 — */
export function formatScore(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "—";
  return `${Math.round(score * 100)} 分`;
}

/** 毫秒 → `12 分 34 秒` / `45 秒` */
export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "不到 1 秒";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  return seconds === 0 ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
}

export function formatOvertime(ms: number): string {
  return `超时 ${formatDuration(ms)}`;
}

/** 试卷类型短标签：`限时 60 分钟` / `不限时` */
export function formatPaperKind(paper: Pick<ExamPaper, "kind" | "durationMinutes">): string {
  if (paper.kind === "timed" && paper.durationMinutes) {
    return `限时 ${paper.durationMinutes} 分钟`;
  }
  return "不限时";
}

export function formatPaperSource(source: ExamPaper["source"]): string {
  return source === "auto" ? "自动组卷" : "手工组卷";
}

/** 掐头去尾的题干摘要（列表、预览、答题卡复用） */
export function truncateContent(content: string, max = 120): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 答案展示：多选存的是 JSON 数组、填空存的是 `；` 连接，
 * 统一变成 `A、C` / `甲 / 乙` 这种一眼能读的样子。空值明确显示"未作答"。
 */
export function formatAnswerText(value: string | null | undefined): string {
  if (!value || !value.trim()) return "未作答";
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = safeParseJson<unknown>(trimmed, null);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => String(item)).join("、");
    }
  }
  if (/^[A-Z]+$/.test(trimmed) && trimmed.length > 1) {
    return trimmed.split("").join("、");
  }
  return trimmed.replace(/；/g, " / ");
}
