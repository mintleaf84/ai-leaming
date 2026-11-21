/**
 * 题集页的展示格式化：成绩、来源、日期、题干摘要。
 * 只做「值 → 中文短句」，不做业务判断（判断在 `stats.ts`）。
 */
import { formatBeijingDate } from "@/lib/utils/datetime";

/**
 * 0~1 的比例 → 「86 分」。服务端若已经给了 0~100 的数就不再乘一次。
 */
export function formatSetScore(
  score: number | null | undefined,
): string | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const percent = score <= 1 ? score * 100 : score;
  return `${Math.round(percent)} 分`;
}

const AGENT_NAME_OVERRIDES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude code": "Claude Code",
  claudecode: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
  chatgpt: "ChatGPT",
  gpt: "GPT",
  opencode: "OpenCode",
  "ai-agent": "AI 助手",
  agent: "外部 Agent",
};

/** `claude-code` → `Claude Code`；认不出来的原样保留，不猜 */
export function humanizeAgentName(
  name: string | null | undefined,
): string | null {
  if (!name || !name.trim()) return null;
  const raw = name.trim();
  const override = AGENT_NAME_OVERRIDES[raw.toLowerCase()];
  if (override) return override;
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** 来源一行：`Claude Code · claude-sonnet-4.5`；都没有时给一句可读的兜底 */
export function formatSetSource(
  agent: string | null,
  model: string | null,
): string {
  const label = humanizeAgentName(agent);
  if (label && model) return `${label} · ${model}`;
  if (label) return label;
  if (model) return model;
  return "来源未标注";
}

/** `2026-11-21T…` → `11月21日`；无效日期返回 null（页面直接不渲染） */
export function formatSetDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const formatted = formatBeijingDate(value, "M月D日");
  return formatted === "Invalid Date" ? null : formatted;
}

/** 掐头去尾的题干摘要：列表里一行两行就够 */
export function summarizeStem(content: string, max = 110): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 考点 chips 最多显示几个，剩下的收成 `+N` */
export function splitTags(
  tags: string[],
  max = 4,
): {
  shown: string[];
  rest: number;
} {
  const cleaned = tags.map((tag) => tag.trim()).filter(Boolean);
  return {
    shown: cleaned.slice(0, max),
    rest: Math.max(0, cleaned.length - max),
  };
}
