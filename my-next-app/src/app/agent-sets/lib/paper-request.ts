/**
 * 一键成卷的请求体构造与响应读取（纯函数）。
 *
 * 契约只写「建一张 exam_papers（source='agent'），题目取该题集可用题」，
 * 没有逐字定字段。这里发最小且最好猜的一组：`{title, kind, durationMinutes}`。
 * 不限时时**不带** `durationMinutes`——带个 0/null 容易被服务端校验成"限时 0 分钟"。
 */
import type { AgentSetSummary, MakePaperInput } from "./types";

const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 180;
export const DEFAULT_DURATION_MINUTES = 30;

/** 弹窗预填的标题：`教育心理学 · 弱项强化 · 成卷` */
export function defaultPaperTitle(set: Pick<AgentSetSummary, "title">): string {
  return `${set.title} · 成卷`;
}

export function clampDurationMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DURATION_MINUTES;
  return Math.min(
    MAX_DURATION_MINUTES,
    Math.max(MIN_DURATION_MINUTES, Math.round(value)),
  );
}

/**
 * 弹窗输入 → 请求体。标题空着就回退到默认标题（服务端不接受空标题）。
 * 限时但分钟数非法时夹到 5~180，而不是直接发出去让服务端 400。
 */
export function buildPaperRequest(input: {
  setTitle: string;
  title: string;
  timed: boolean;
  durationMinutes: number;
}): MakePaperInput {
  const trimmed = input.title.trim();
  const title = trimmed || defaultPaperTitle({ title: input.setTitle });
  if (!input.timed) {
    return { title, kind: "fixed", durationMinutes: null };
  }
  return {
    title,
    kind: "timed",
    durationMinutes: clampDurationMinutes(input.durationMinutes),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 成卷响应里取试卷 id：`{paper:{id}}` / `{id}` / `{paperId}` 都认。
 * 拿不到 id 就没法跳转，调用方要按失败处理（宁可报错也不跳 `/exam/undefined`）。
 */
export function readCreatedPaperId(body: unknown): number | null {
  if (!isRecord(body)) return null;
  const candidates: unknown[] = [];
  if (isRecord(body.paper)) candidates.push(body.paper.id);
  if (isRecord(body.examPaper)) candidates.push(body.examPaper.id);
  candidates.push(body.paperId, body.id);

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      return Number(candidate);
    }
  }
  return null;
}
