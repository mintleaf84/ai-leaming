/**
 * Agent 题集的接口形状 —— 对齐 `docs/agent-question-set-plan.md` §3 / §4.2 / §5。
 *
 * 服务端由另一条 lane 并行实现。契约只定到「列表含未做数与来源」「详情不含答案」
 * 这一级，字段名没有逐字钉死，所以这里全部按**可能出现的几种写法**归一（见
 * `api.ts` 的 normalize 系列）：
 *   - 包装可能是 `{items}` / `{sets}` / `{data}` / 裸数组；
 *   - 题量可能是 `totalQuestions` / `count` / `questionCount`；
 *   - 未读数可能是 `unread` / `isUnread` / `unreadCount`。
 *
 * 归一之后页面只认下面这一套字段，服务端补齐后再改一处即可。
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
  /** 批次总题量 */
  totalQuestions: number;
  /** 已做（有作答记录）的题数 */
  doneCount: number;
  /** 被你标为「有问题」并已移除的题数 */
  flaggedCount: number;
  /** 还剩多少题可以做（服务端给就用服务端的，否则本地派生） */
  pendingCount: number;
  /** 新批次未读（契约没有独立的已读接口，按服务端返回的字段渲染） */
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
