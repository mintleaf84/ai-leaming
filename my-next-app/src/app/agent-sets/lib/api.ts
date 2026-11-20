/**
 * 题集 REST 客户端（`/api/agent-sets/*`，cookie 认证）。
 *
 * 为什么直接 fetch、不写 Server Actions：移动端只有 REST 一条路，Web 再实现
 * 一套「开始练习 / 判分 / 报错 / 转正」就是两份会漂移的逻辑。页面在客户端组件里
 * 调用这里，服务端组件只负责路由参数与 metadata。
 *
 * 逐题判分复用现有的 `POST /api/practice/session/{id}/submit`（契约 §4.2）——
 * 判分规则只有服务端那一份，客户端不复刻。
 *
 * 契约没把字段名逐字钉死，所以下面所有 normalize 都按几种常见写法兜底；
 * 服务端落地后如果命名不同，只改这一个文件。
 */
import type { ExamQuestion } from "@/app/exam/lib/types";
import { safeParseJson } from "@/lib/utils/json";
import { describeRequestError } from "./errors";
import { readCreatedPaperId } from "./paper-request";
import { derivePendingCount } from "./stats";
import type {
  AgentSetAttempt,
  AgentSetDetail,
  AgentSetItem,
  AgentSetJudgeResult,
  AgentSetSummary,
  MakePaperInput,
} from "./types";

const BASE = "/api/agent-sets";
const PRACTICE_BASE = "/api/practice";

export class AgentSetRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "AgentSetRequestError";
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      return Number(value);
    }
  }
  return null;
}

function firstString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** `["a","b"]` / `'["a","b"]'` / `"a,b"` 三种都吃；其余给空数组 */
function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = safeParseJson<unknown>(value, null);
    if (Array.isArray(parsed)) return normalizeTags(parsed);
    return value
      .split(/[,，;；|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQuestion(input: unknown, fallbackId: number): ExamQuestion {
  const raw = isRecord(input) ? input : {};
  const id = firstNumber(raw, ["id", "questionId", "question_id"]);
  const optionsValue = raw.options;
  const options = Array.isArray(optionsValue)
    ? optionsValue.map((option) => (typeof option === "string" ? option : ""))
    : normalizeTags(optionsValue);
  return {
    id: id ?? fallbackId,
    content: typeof raw.content === "string" ? raw.content : "",
    options: options.filter((option) => option.length > 0),
    type: typeof raw.type === "string" ? raw.type : null,
    tags: normalizeTags(raw.tags),
    dimension: typeof raw.dimension === "string" ? raw.dimension : null,
    // 详情接口**不含答案**（契约 §4.2 防作弊），这里保持 null，不猜
    answer: null,
    explanation: null,
    material: typeof raw.material === "string" ? raw.material : null,
    material_html:
      typeof raw.material_html === "string" ? raw.material_html : null,
  };
}

function normalizeItems(rawItems: unknown): AgentSetItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((entry, index): AgentSetItem | null => {
      if (!isRecord(entry)) return null;
      // 冻结形状是扁平题（`{id,content,…}`）；兼容早期 `{position, question}` 写法
      const questionSource = isRecord(entry.question) ? entry.question : entry;
      const position = firstNumber(entry, ["position", "index"]);
      const question = normalizeQuestion(questionSource, index + 1);
      if (!question.content) return null;
      const answered =
        entry.answered === true ||
        entry.done === true ||
        entry.completed === true ||
        entry.answeredAt !== undefined;
      return {
        position: position && position > 0 ? position : index + 1,
        question,
        answered,
      };
    })
    .filter((item): item is AgentSetItem => item !== null);
}

export function normalizeSetSummary(
  input: unknown,
  fallbackId: number,
  itemCount = 0,
): AgentSetSummary {
  const raw = isRecord(input) ? input : {};

  const totalQuestions =
    firstNumber(raw, [
      "totalQuestions",
      "count",
      "questionCount",
      "question_count",
      "size",
    ]) ?? itemCount;
  const doneCount = firstNumber(raw, [
    "doneCount",
    "answeredCount",
    "completedCount",
    "done_count",
  ]);
  const flaggedCount =
    firstNumber(raw, ["flaggedCount", "flagCount", "flagged_count"]) ?? 0;
  const serverPending = firstNumber(raw, [
    "pendingCount",
    "remaining",
    "remainingCount",
    "todoCount",
    "undoneCount",
  ]);

  const unreadCount = firstNumber(raw, ["unreadCount", "unread_count"]);
  const unread =
    raw.unread === true ||
    raw.isUnread === true ||
    raw.viewed === false ||
    (unreadCount !== null && unreadCount > 0);

  const total = Math.max(itemCount, totalQuestions);
  // 冻结形状（§4.3）只给 questionCount / pendingCount / flaggedCount，没有 doneCount：
  // 已做 = 总量 − 未做 − 已反馈。详情里服务端只回待做的题时（itemCount），
  // 用它反推 done 也不会把「全做完了」算成「一题没做」。
  const doneBase = doneCount ?? Math.max(0, total - Math.min(itemCount, total));
  const pending = derivePendingCount({
    totalQuestions: total,
    doneCount: doneBase,
    flaggedCount,
    serverPending,
  });
  return {
    id: firstNumber(raw, ["id", "setId", "set_id"]) ?? fallbackId,
    title: firstString(raw, ["title", "name"]) ?? "未命名题集",
    agent: firstString(raw, ["agent", "agentName", "source", "sourceAgent"]),
    model: firstString(raw, ["model", "modelName"]),
    targetTags: normalizeTags(
      raw.targetTags ?? raw.target_tags ?? raw.tags ?? raw.keypoints,
    ),
    note: firstString(raw, ["note", "description"]),
    status: firstString(raw, ["status"]) ?? "active",
    createdAt: firstString(raw, ["createdAt", "created_at"]),
    totalQuestions: total,
    doneCount: doneCount ?? Math.max(0, total - pending - flaggedCount),
    flaggedCount,
    pendingCount: pending,
    unread,
    lastScore: firstNumber(raw, [
      "lastScore",
      "bestScore",
      "recentScore",
      "score",
    ]),
    lastAttemptAt: firstString(raw, [
      "lastAttemptAt",
      "lastSubmittedAt",
      "submittedAt",
      "updatedAt",
    ]),
  };
}

/**
 * 冻结形状是 `{data, meta:{limit,offset,total}}`（§4.3）；`{items}` / 裸数组
 * 是过渡期的兼容写法，留着不会坏事。
 */
function readListBody(body: unknown): { raws: unknown[]; total: number | null } {
  if (Array.isArray(body)) return { raws: body, total: body.length };
  if (isRecord(body)) {
    const meta = isRecord(body.meta) ? body.meta : null;
    const metaTotal = meta ? firstNumber(meta, ["total"]) : null;
    for (const key of ["data", "items", "sets", "questionSets"] as const) {
      const value = body[key];
      if (Array.isArray(value)) {
        return {
          raws: value,
          total: metaTotal ?? firstNumber(body, ["total"]),
        };
      }
    }
    return { raws: [], total: metaTotal ?? 0 };
  }
  return { raws: [], total: 0 };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // 转换重抛：网络层失败变成用户能读懂的一种错误，调用方只处理 AgentSetRequestError
    throw new AgentSetRequestError(describeRequestError(0), 0, error);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    throw new AgentSetRequestError(
      describeRequestError(response.status, body),
      response.status,
      body,
    );
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new AgentSetRequestError(
      "服务返回的内容无法解析，请稍后重试",
      response.status,
      error,
    );
  }
}

export interface AgentSetList {
  items: AgentSetSummary[];
  /** 服务端 `meta.total`；没有 meta 时退回本页条数 */
  total: number;
}

export async function fetchAgentSetList(params?: {
  limit?: number;
  offset?: number;
}): Promise<AgentSetList> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") {
    query.set("offset", String(params.offset));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const body = await request<unknown>(`${BASE}${suffix}`);
  const { raws, total } = readListBody(body);
  const items = raws
    .map((raw) => normalizeSetSummary(raw, 0))
    .filter((item) => item.id > 0);
  return { items, total: Math.max(total ?? items.length, items.length) };
}

export async function fetchAgentSetDetail(
  setId: number,
): Promise<AgentSetDetail> {
  const body = await request<unknown>(`${BASE}/${setId}`);
  const raw = isRecord(body) ? body : {};

  // `{set, questions}` 是冻结形状；`{set, items}` / 摊平是过渡写法。
  // `flaggedCount` 在**顶层**（§4.3），要并进 set 里再归一。
  const nested = isRecord(raw.set) ? raw.set : isRecord(raw.data) ? raw.data : null;
  const setRaw = nested
    ? { ...nested, flaggedCount: raw.flaggedCount ?? nested.flaggedCount }
    : raw;
  const rawItems = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.data)
        ? raw.data
        : [];

  const items = normalizeItems(rawItems);
  return {
    set: normalizeSetSummary(setRaw, setId, items.length),
    items,
  };
}

export async function startAgentSetAttempt(
  setId: number,
): Promise<AgentSetAttempt> {
  const body = await request<unknown>(`${BASE}/${setId}/attempts`, {
    method: "POST",
  });
  const raw = isRecord(body) ? body : {};
  const nested = isRecord(raw.attempt)
    ? raw.attempt
    : isRecord(raw.session)
      ? raw.session
      : null;
  const source = nested ?? raw;

  const sessionId =
    firstString(source, ["sessionId", "session_id", "id"]) ??
    firstString(raw, ["sessionId", "session_id"]);

  const rawQuestions = Array.isArray(source.questions)
    ? source.questions
    : Array.isArray(raw.questions)
      ? raw.questions
      : [];

  if (!sessionId) {
    // 没有会话 id 就发不出判分请求；宁可当场报错，也不要进入一个"答了不记分"的假练习
    throw new AgentSetRequestError(
      "练习没能开始，请稍后重试",
      200,
      body,
    );
  }

  return {
    sessionId,
    questions: rawQuestions.map((entry, index) => {
      const source = isRecord(entry) && isRecord(entry.question) ? entry.question : entry;
      return normalizeQuestion(source, index + 1);
    }),
  };
}

/** 逐题判分（复用练习会话的 submit 接口） */
export async function submitAgentSetAnswer(
  sessionId: string,
  input: { questionId: number; userAnswer: string; duration: number },
): Promise<AgentSetJudgeResult> {
  const body = await request<unknown>(
    `${PRACTICE_BASE}/session/${encodeURIComponent(sessionId)}/submit`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  const raw = isRecord(body) ? body : {};
  return { isCorrect: raw.isCorrect === true };
}

/** 报「这题有问题」：返回剩余可做题数（服务端没给就是 null，页面用本地派生） */
export async function flagAgentSetQuestion(
  setId: number,
  questionId: number,
  reason?: string,
): Promise<{ remaining: number | null }> {
  const body = await request<unknown>(
    `${BASE}/${setId}/questions/${questionId}/flag`,
    {
      method: "POST",
      body: JSON.stringify(reason && reason.trim() ? { reason: reason.trim() } : {}),
    },
  );
  const raw = isRecord(body) ? body : {};
  return {
    remaining: firstNumber(raw, ["remaining", "remainingCount", "pendingCount"]),
  };
}

/** 转正入库：转正后题目进题库与掌握度统计。返回转正题数（契约 §4.3） */
export async function promoteAgentSet(
  setId: number,
): Promise<{ promotedCount: number | null }> {
  const body = await request<unknown>(`${BASE}/${setId}/promote`, {
    method: "POST",
  });
  const raw = isRecord(body) ? body : {};
  return { promotedCount: firstNumber(raw, ["promotedCount", "count"]) };
}

/** 一键成卷：返回新建试卷的 id，供页面跳到 `/exam/{id}` */
export async function createPaperFromSet(
  setId: number,
  input: MakePaperInput,
): Promise<number> {
  const body = await request<unknown>(`${BASE}/${setId}/paper`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const paperId = readCreatedPaperId(body);
  if (paperId === null) {
    throw new AgentSetRequestError(
      "试卷已生成，但没能拿到编号，请到试卷页查看",
      200,
      body,
    );
  }
  return paperId;
}
