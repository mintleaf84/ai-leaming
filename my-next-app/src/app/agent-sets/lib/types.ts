/**
 * Agent 题集的接口形状 —— 对齐 `docs/agent-question-set-plan.md` §3 / §4.2 / §4.3。
 *
 * §4.3 已冻结响应形状：
 *   - 列表 `{data:[…], meta:{limit,offset,total}}`
 *   - 详情 `{set, questions:[扁平题], flaggedCount}`（不含 answer/explanation）
 *   - attempts `{sessionId, questions}`；flag `{questionId, flagged, remaining}`
 *   - promote `{setId, promoted, promotedCount}`；paper 与试卷详情同形
 *   - 分数一律 0–1，`durationMs` 为整数毫秒
 *
 * 服务端只给 `questionCount / pendingCount / flaggedCount`，**没有 doneCount**：
 * 这里的 `doneCount` 由 `总量 − 未做 − 已反馈` 派生（见 `api.ts`），页面只认下面
 * 这一套字段。
 */
import type { ExamQuestion } from "@/app/exam/lib/types";

export type AgentSetStatus = "active" | "archived" | "promoted" | (string & {});

/** 列表卡片用到的题集摘要 */
export interface AgentSetSummary {
  id: number;
  title: string;
  /** 哪个外部工具推的（如 "claude-code"），可空 */
  agent: string | null;
  /** 可选，留痕用的模型名 */
  model: string | null;
  /** Agent 声称针对的考点 */
  targetTags: string[];
  /** 「为什么给你出这些」 */
  note: string | null;
  status: AgentSetStatus;
  createdAt: string | null;
  /** 批次总题量（服务端 `questionCount`） */
  totalQuestions: number;
  /** 已做：服务端没有该字段时按 `总量 − 未做 − 已反馈` 派生 */
  doneCount: number;
  /** 被你标为「有问题」并已移除的题数（列表接口不返回，按 0 处理） */
  flaggedCount: number;
  /** 还剩多少题可以做（服务端 `pendingCount`） */
  pendingCount: number;
  /** 新批次未读数大于 0 即为未读（服务端 `unreadCount`） */
  unread: boolean;
  /** 最近一次成绩，0~1；没有作答记录时为 null */
  lastScore: number | null;
  lastAttemptAt: string | null;
}

/** 题集里的一道题（题目本体沿用试卷页的题目形状，便于复用题面组件） */
export interface AgentSetItem {
  /** 批次内顺序（从 1 开始） */
  position: number;
  question: ExamQuestion;
  /** 已经作答过：不再出现在待做列表 */
  answered: boolean;
}

/** 题集详情（不含答案） */
export interface AgentSetDetail {
  set: AgentSetSummary;
  items: AgentSetItem[];
}

/** `POST /agent-sets/{id}/attempts` 的返回 */
export interface AgentSetAttempt {
  sessionId: string;
  /** 服务端若直接回题面就用它，否则用详情里的待做题 */
  questions: ExamQuestion[];
}

/** `POST /agent-sets/{id}/paper` 的入参（一键成卷） */
export interface MakePaperInput {
  title: string;
  kind: "timed" | "fixed";
  durationMinutes: number | null;
}

/** 逐题判分的返回（复用 `POST /practice/session/{id}/submit`） */
export interface AgentSetJudgeResult {
  isCorrect: boolean;
}

/** 报「这题有问题」的入参 */
export interface FlagQuestionInput {
  reason?: string;
}
