/**
 * 试卷（模考）接口形状 —— 与 `docs/exam-paper-plan.md` §2/§3/§4 的契约对齐。
 *
 * 服务端由另一条 lane 并行实现，这里按契约写类型、**不引用服务端代码**：
 * 页面只认 `/api/exam/*` 的 JSON。契约里没写死的可选字段（列表包装、详情里的
 * `lastAttempt`、作答态里的 `answers`）都在 `api.ts` 里做一次容错归一，避免
 * 两边进度不一致时页面直接白屏。
 */

export type ExamPaperKind = "fixed" | "timed";
export type ExamPaperSource = "manual" | "auto";

/** 试卷里的题目（与 `/practice/session` 的题目形状一致；`answer` 未交卷时置空） */
export interface ExamQuestion {
  id: number;
  content: string;
  options: string[];
  type?: string | null;
  tags?: string[];
  dimension?: string | null;
  answer?: string | null;
  explanation?: string | null;
  material?: string | null;
  material_html?: string | null;
}

export interface ExamPaper {
  id: number;
  title: string;
  kind: ExamPaperKind;
  /** 限时分钟数；`kind=fixed` 时为 null */
  durationMinutes: number | null;
  source: ExamPaperSource;
  totalQuestions: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** 以下三项只出现在列表接口 */
  attemptCount?: number | null;
  /** 0~1 的比例（每题 1 分） */
  bestScore?: number | null;
  lastAttemptAt?: string | null;
}

export interface ExamPaperItem {
  position: number;
  question: ExamQuestion;
}

export interface ExamAttemptSummary {
  sessionId?: string | null;
  score?: number | null;
  submittedAt?: string | null;
  deadlineAt?: string | null;
}

export interface ExamPaperDetail {
  paper: ExamPaper;
  items: ExamPaperItem[];
  lastAttempt?: ExamAttemptSummary | null;
}

/** `POST /papers/{id}/attempts` 的返回 */
export interface ExamAttemptStart {
  sessionId: string;
  paperId: number;
  /** ISO 时间；不限时为 null */
  deadlineAt?: string | null;
  questions: ExamQuestion[];
}

export interface ExamPerQuestionResult {
  questionId: number;
  isCorrect: boolean;
  /** 标准答案（交卷后才返回） */
  correctAnswer?: string | null;
  explanation?: string | null;
}

export interface ExamResult {
  /** 0~1 */
  score: number;
  correctCount: number;
  totalQuestions: number;
  durationMs: number;
  overtimeMs: number;
  overtime: boolean;
  /** 同一 session 重复交卷时为 true（服务端幂等） */
  duplicate: boolean;
  perQuestion: ExamPerQuestionResult[];
}

/**
 * `GET /attempts/{sessionId}`：作答态与结果态共用一个响应。
 * - 未交卷：给 `questions`，`answer` 置空、`result` 缺省；
 * - 已交卷：给 `result`（契约 §4 的返回体）。
 *
 * `deadlineAt` 契约里只写在"开始作答"的返回上，这里按可选读取：刷新后倒计时
 * 必须能恢复，靠的是这条字段；服务端若没带，会退回本地按 sessionId 缓存的值
 * （见 `lib/draft-storage.ts` 的 deadline 存取）。
 */
export interface ExamAttemptDetail {
  paper: ExamPaper;
  questions: ExamQuestion[];
  answers?: ExamAnswerEntry[] | null;
  result?: ExamResult | null;
  deadlineAt?: string | null;
}

export interface ExamAnswerEntry {
  questionId: number;
  userAnswer?: string | null;
}

export interface CreatePaperInput {
  title: string;
  kind: ExamPaperKind;
  durationMinutes?: number;
  questionIds: number[];
}

export interface GeneratePaperWeights {
  wrong: number;
  weak: number;
  fresh: number;
}

/** `POST /papers/generate` 的请求体（契约 §3） */
export interface GeneratePaperInput {
  title: string;
  kind: ExamPaperKind;
  durationMinutes?: number;
  count: number;
  tags?: string[];
  dimensions?: string[];
  types?: string[];
  excludeRecentDays?: number;
  weights?: GeneratePaperWeights;
}

/** 组卷数量不足时服务端返回的 400 体（契约 §3.2） */
export interface GenerateShortfallBody {
  requested: number;
  available: number;
  shortfall: number;
}

export interface SubmitAnswerInput {
  questionId: number;
  /** 单选/判断：`"A"`；多选：`'["A","C"]'`；填空：`"空1；空2"` */
  userAnswer: string;
  durationMs: number;
}

/** `POST /attempts/{sessionId}/submit` 的请求体（契约 §4） */
export interface SubmitPayload {
  answers: SubmitAnswerInput[];
  /** 本次作答的稳定标识：重试时不变，服务端仅作日志/兜底 */
  clientKey: string;
}
