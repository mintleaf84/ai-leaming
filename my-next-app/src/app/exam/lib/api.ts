/**
 * 试卷 REST 客户端（`/api/exam/*`，cookie 认证）。
 *
 * 为什么直接 fetch、不写 Server Actions（契约 §5）：移动端只有 REST 一条路，
 * Web 端再实现一套 Server Actions 就是两份"判分 / 归属 / 幂等"逻辑，必然漂移。
 * 所以页面只在客户端组件里调用这里，服务端组件只负责路由参数与 metadata。
 *
 * 错误统一抛 `ExamRequestError`：带上 HTTP 状态与原始 body —— 自动组卷"题库题量
 * 不足"的 400 会把 `{requested, available, shortfall}` 放在 body 里，弹窗要把
 * 这三个数字念给用户听，光有 message 拿不到。
 */
import { coerceJsonColumn } from "@/lib/utils/json";
import type {
  CreatePaperInput,
  ExamAnswerEntry,
  ExamAttemptDetail,
  ExamAttemptStart,
  ExamPaper,
  ExamPaperDetail,
  ExamPaperItem,
  ExamPerQuestionResult,
  ExamQuestion,
  ExamResult,
  GeneratePaperInput,
  SubmitPayload,
} from "./types";

const BASE = "/api/exam";

export class ExamRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ExamRequestError";
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function messageFromBody(body: unknown, status: number): string {
  if (isRecord(body)) {
    const raw = body.error ?? body.message;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  if (status === 401) return "登录状态已失效，请重新登录后再试";
  if (status === 403) return "没有权限操作这份试卷";
  if (status === 404) return "试卷或作答记录不存在";
  if (status === 409) return "这份试卷已有作答记录，不能再删除";
  return `请求失败（${status}）`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // 转换重抛：网络层失败要变成用户能读懂的文案，调用方只处理一种错误类型
    throw new ExamRequestError(
      "网络连接失败，请检查网络后重试",
      0,
      error,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    throw new ExamRequestError(messageFromBody(body, response.status), response.status, body);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ExamRequestError("服务返回的内容无法解析，请稍后重试", response.status, error);
  }
}

function normalizeQuestion(input: unknown): ExamQuestion {
  const raw = isRecord(input) ? input : {};
  return {
    id: toNumberOr(raw.id, 0),
    content: typeof raw.content === "string" ? raw.content : "",
    // 库里的 options/tags 是 text 列，某些链路会回字符串；coerceJsonColumn 两种都吃
    options: coerceJsonColumn<string[]>(raw.options, []),
    type: typeof raw.type === "string" ? raw.type : null,
    tags: coerceJsonColumn<string[]>(raw.tags, []),
    dimension: typeof raw.dimension === "string" ? raw.dimension : null,
    answer: typeof raw.answer === "string" ? raw.answer : null,
    explanation: typeof raw.explanation === "string" ? raw.explanation : null,
    material: typeof raw.material === "string" ? raw.material : null,
    material_html: typeof raw.material_html === "string" ? raw.material_html : null,
  };
}

function normalizePaper(input: unknown): ExamPaper {
  const raw = isRecord(input) ? input : {};
  return {
    id: toNumberOr(raw.id, 0),
    title: typeof raw.title === "string" && raw.title ? raw.title : "未命名试卷",
    kind: raw.kind === "timed" ? "timed" : "fixed",
    durationMinutes: toOptionalNumber(raw.durationMinutes),
    source: raw.source === "auto" ? "auto" : "manual",
    totalQuestions: toNumberOr(raw.totalQuestions, 0),
    createdAt: toOptionalString(raw.createdAt),
    updatedAt: toOptionalString(raw.updatedAt),
    attemptCount: toOptionalNumber(raw.attemptCount),
    bestScore: toOptionalNumber(raw.bestScore),
    lastAttemptAt: toOptionalString(raw.lastAttemptAt),
  };
}

function normalizePaperItem(input: unknown, index: number): ExamPaperItem {
  const raw = isRecord(input) ? input : {};
  // 契约是 `{position, question}`；服务端若直接摊平题目（`{position, id, content…}`），
  // 这里同样能读 —— 两条 lane 合并时少一个"空题目卡片"的隐性故障。
  const questionSource = isRecord(raw.question) ? raw.question : raw;
  return {
    position: toNumberOr(raw.position, index + 1),
    question: normalizeQuestion(questionSource),
  };
}

function normalizeResult(input: unknown): ExamResult | null {
  if (!isRecord(input)) return null;
  const perQuestion = Array.isArray(input.perQuestion) ? input.perQuestion : [];
  return {
    score: toNumberOr(input.score, 0),
    correctCount: toNumberOr(input.correctCount, 0),
    totalQuestions: toNumberOr(input.totalQuestions, 0),
    durationMs: toNumberOr(input.durationMs, 0),
    overtimeMs: toNumberOr(input.overtimeMs, 0),
    overtime: input.overtime === true,
    duplicate: input.duplicate === true,
    perQuestion: perQuestion.filter(isRecord).map((entry): ExamPerQuestionResult => ({
      questionId: toNumberOr(entry.questionId, 0),
      isCorrect: entry.isCorrect === true,
      correctAnswer:
        typeof entry.correctAnswer === "string" ? entry.correctAnswer : null,
      explanation:
        typeof entry.explanation === "string" ? entry.explanation : null,
    })),
  };
}

function normalizeAnswerEntries(input: unknown): ExamAnswerEntry[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isRecord).map((entry) => ({
    questionId: toNumberOr(entry.questionId, 0),
    userAnswer: typeof entry.userAnswer === "string" ? entry.userAnswer : null,
  }));
}

/** `{items}` / `{papers}` / 裸数组 三种包装都接受（契约只写了"列表，含 …"） */
function readList(body: unknown): { items: unknown[]; total: number } {
  if (Array.isArray(body)) return { items: body, total: body.length };
  if (isRecord(body)) {
    const rawItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.papers)
        ? body.papers
        : [];
    const total = toNumberOr(body.total, rawItems.length);
    return { items: rawItems, total };
  }
  return { items: [], total: 0 };
}

/** 创建/组卷接口可能回 `{paper}`，也可能直接回试卷对象 */
function readPaper(body: unknown): ExamPaper {
  if (isRecord(body) && isRecord(body.paper)) return normalizePaper(body.paper);
  return normalizePaper(body);
}

export interface ExamPaperList {
  items: ExamPaper[];
  total: number;
}

export async function fetchPaperList(params: {
  limit: number;
  offset: number;
}): Promise<ExamPaperList> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  const body = await request<unknown>(`/papers?${query.toString()}`);
  const { items, total } = readList(body);
  return { items: items.map(normalizePaper), total };
}

export async function fetchPaperDetail(paperId: number): Promise<ExamPaperDetail> {
  const body = await request<unknown>(`/papers/${paperId}`);
  const raw = isRecord(body) ? body : {};
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const paper = isRecord(raw.paper)
    ? normalizePaper(raw.paper)
    : normalizePaper(raw);
  const lastAttempt = isRecord(raw.lastAttempt)
    ? {
        sessionId: toOptionalString(raw.lastAttempt.sessionId),
        score: toOptionalNumber(raw.lastAttempt.score),
        submittedAt: toOptionalString(raw.lastAttempt.submittedAt),
        deadlineAt: toOptionalString(raw.lastAttempt.deadlineAt),
      }
    : null;
  return {
    paper,
    items: itemsRaw.map(normalizePaperItem),
    lastAttempt,
  };
}

export async function createPaper(input: CreatePaperInput): Promise<ExamPaper> {
  const body = await request<unknown>("/papers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return readPaper(body);
}

export async function generatePaper(input: GeneratePaperInput): Promise<ExamPaper> {
  const body = await request<unknown>("/papers/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return readPaper(body);
}

export async function deletePaper(paperId: number): Promise<void> {
  await request<unknown>(`/papers/${paperId}`, { method: "DELETE" });
}

export async function startAttempt(paperId: number): Promise<ExamAttemptStart> {
  const body = await request<unknown>(`/papers/${paperId}/attempts`, {
    method: "POST",
  });
  const raw = isRecord(body) ? body : {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
    paperId: toNumberOr(raw.paperId, paperId),
    deadlineAt: toOptionalString(raw.deadlineAt),
    questions: questions.map(normalizeQuestion),
  };
}

export async function fetchAttempt(sessionId: string): Promise<ExamAttemptDetail> {
  const body = await request<unknown>(`/attempts/${sessionId}`);
  const raw = isRecord(body) ? body : {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    paper: normalizePaper(raw.paper),
    questions: questions.map(normalizeQuestion),
    answers: normalizeAnswerEntries(raw.answers),
    result: normalizeResult(raw.result),
    deadlineAt: toOptionalString(raw.deadlineAt),
  };
}

export async function submitAttempt(
  sessionId: string,
  payload: SubmitPayload,
): Promise<ExamResult> {
  const body = await request<unknown>(`/attempts/${sessionId}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const result = normalizeResult(isRecord(body) && isRecord(body.result) ? body.result : body);
  if (!result) {
    throw new ExamRequestError("交卷结果无法解析，请稍后在成绩单查看", 200, body);
  }
  return result;
}
