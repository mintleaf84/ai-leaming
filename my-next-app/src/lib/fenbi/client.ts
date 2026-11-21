/**
 * 粉笔 HTTP 客户端（docs/fenbi-sync-design.md §2，2026-11-21 实测）。
 *
 * ## 只做"发请求 + 归一化错误"，不做业务判断
 *
 * 列表/详情/题目的分页、去重、落库都在 `sync.ts`；这里只保证三件事：
 * 1. 每个请求 8 秒超时（粉笔偶发挂住，同步是用户点出来的，不能无限等）；
 * 2. 请求头与真实浏览器一致（UA / Origin / Referer），机房 IP 靠这个才不被
 *    阿里云 fpr 直接弹滑块；
 * 3. 错误分类清楚：**430 是风控**，永远不自动重试（设计文档 §2.1/§6）。
 *
 * ## 不记录任何凭据
 *
 * 这个模块里没有一处 `log` 会带上 cookie / 密码 / 手机号：调用方拿到的错误对象
 * 只带状态码、contextId 与粉笔返回的 msg，手机号由路由层自行掩码。
 */

const REQUEST_TIMEOUT_MS = 8_000;

const LOGIN_BASE = "https://login.fenbi.com";
const TIKU_BASE = "https://tiku.fenbi.com";
const QRCODE_BASE = "https://ke.fenbi.com";

/**
 * 与粉笔 Web 端一致的请求头：Origin/Referer 是 fpr 风控的判定输入，
 * 缺了它们即使 cookie 正确也会回 430。UA 固定一个主流 Chrome 版本。
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: "https://www.fenbi.com",
  Referer: "https://www.fenbi.com/",
};

/** 粉笔 Web 端固定的版本参数（实测 kav/av/hav=121 可用） */
const WEB_VERSION_QUERY = "app=web&kav=121&av=121&hav=121";

/** 单次请求最多拉多少题目（上游没有明说上限，50 是实测稳定的量级） */
const QUESTION_CHUNK_SIZE = 50;

// ==================== 错误类型 ====================

/** HTTP 430：阿里云 fpr 风控（返回体只有 contextId）。**不重试** */
export class FenbiRiskControlError extends Error {
  constructor(readonly contextId: string | null) {
    super("粉笔触发了风控验证（HTTP 430）");
    this.name = "FenbiRiskControlError";
  }
}

/** 401/403：登录态失效，需要用户重新绑定 */
export class FenbiAuthError extends Error {
  constructor(
    readonly status: number,
    message = "粉笔登录态已失效",
  ) {
    super(message);
    this.name = "FenbiAuthError";
  }
}

/** 其它非 2xx */
export class FenbiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FenbiHttpError";
  }
}

/** 超时 / 连接失败 */
export class FenbiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FenbiNetworkError";
  }
}

/** 返回体不是预期的 JSON（粉笔偶尔回 HTML 错误页） */
export class FenbiProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FenbiProtocolError";
  }
}

/** 登录接口明确拒绝（code !== 1） */
export class FenbiLoginError extends Error {
  constructor(
    readonly code: number | null,
    readonly serverMessage: string,
  ) {
    super("粉笔登录被拒绝");
    this.name = "FenbiLoginError";
  }
}

// ==================== 基础请求 ====================

function readSetCookies(res: Response): string[] {
  // Node 18.14+/undici 提供 getSetCookie；TS 的 lib.dom 里不保证有，故按可选读
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * 从 Set-Cookie 头里抽 name=value。
 * 同时处理删除态（`name=; Max-Age=0`）：删掉 map 里同名项，避免把失效 cookie
 * 继续当有效凭据用。
 */
export function parseCookieJar(
  setCookieHeaders: string[],
  jar: Record<string, string> = {},
): Record<string, string> {
  const next = { ...jar };
  for (const header of setCookieHeaders) {
    const pair = header.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    if (!value) {
      delete next[name];
      continue;
    }
    next[name] = value;
  }
  return next;
}

/** cookie map → `Cookie` 请求头 */
export function serializeCookieJar(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function readJson<T>(res: Response, url: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // 不把 URL 的 query（可能含 questionIds）与返回体写进错误信息
    throw new FenbiProtocolError(
      `粉笔返回了非 JSON 内容（${url.split("?")[0]}，HTTP ${res.status}）`,
    );
  }
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  cookie?: string;
}

/** 统一入口：超时、浏览器头、错误分类 */
async function fenbiRequest(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    ...options.headers,
  };
  if (options.cookie) headers.Cookie = options.cookie;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      // 粉笔没有重定向需求；跟随后 Set-Cookie 容易被跨域丢掉
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new FenbiNetworkError(
        `访问粉笔超时（${REQUEST_TIMEOUT_MS / 1000}s）`,
      );
    }
    throw new FenbiNetworkError("无法连接粉笔服务器");
  }

  if (res.status === 430) {
    // 风控页不一定是 JSON：拿不到 contextId 不影响分类（也不能把风控页正文写进日志）
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as { contextId?: string } | null;
    throw new FenbiRiskControlError(body?.contextId ?? null);
  }
  if (res.status === 401 || res.status === 403) {
    throw new FenbiAuthError(res.status);
  }
  if (!res.ok) {
    throw new FenbiHttpError(res.status, `粉笔接口返回 HTTP ${res.status}`);
  }
  return res;
}

// ==================== 类型 ====================

export interface FenbiExerciseSummary {
  id: string;
  key: string | null;
  status: number | null;
  createdTime: number | null;
  updatedTime: number | null;
  sheet: {
    /** 1=试卷/模考，3=知识点练习（v1 只同步 3） */
    type: number | null;
    name: string | null;
    questionIds: string[];
    questionCount: number | null;
    keypointId: number | null;
  };
}

export interface FenbiUserAnswerRaw {
  questionId?: number | string;
  questionIndex?: number;
  answer?: { choice?: string; blanks?: string[]; type?: number };
  time?: number;
  status?: number;
  flag?: number;
}

export interface FenbiExerciseDetail {
  id: string;
  key: string | null;
  status: number | null;
  createdTime: number | null;
  elapsedTime: number | null;
  userAnswers: Record<string, FenbiUserAnswerRaw>;
  sheet: FenbiExerciseSummary["sheet"];
}

export interface FenbiQuestionRaw {
  id: number | string;
  type?: number;
  content?: string;
  material?: string | null;
  materialIndexes?: number[] | null;
  difficulty?: number;
  accessories?: Array<{ type?: number; options?: string[] }>;
  correctAnswer?: { choice?: string; blanks?: string[]; type?: number };
  solution?: string;
  analysis?: string;
  source?: string;
  shortSource?: string | null;
  keypoints?: Array<{ id: number; name: string }>;
}

export interface FenbiQuestionsPayload {
  materials?: Array<{
    id?: number | string;
    globalId?: string;
    content?: string;
    accessories?: unknown[];
  }>;
  questions: FenbiQuestionRaw[];
}

export type FenbiQrStatus = "pending" | "scanned" | "confirmed" | "expired";

// ==================== 归一化 ====================

function toIdString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

interface RawSheet {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  keypointId?: unknown;
  questionIds?: unknown;
  questionCount?: unknown;
}

function normalizeSheet(
  sheet: RawSheet | undefined,
): FenbiExerciseSummary["sheet"] {
  const ids = Array.isArray(sheet?.questionIds)
    ? sheet.questionIds
        .map((id) => toIdString(id))
        .filter((id): id is string => id !== null)
    : [];
  return {
    type: toNumber(sheet?.type),
    name: typeof sheet?.name === "string" ? sheet.name : null,
    questionIds: ids,
    questionCount: toNumber(sheet?.questionCount),
    keypointId: toNumber(sheet?.keypointId),
  };
}

function normalizeExerciseSummary(
  raw: Record<string, unknown>,
): FenbiExerciseSummary | null {
  const id = toIdString(raw.id);
  if (!id) return null;
  return {
    id,
    key: typeof raw.key === "string" ? raw.key : null,
    status: toNumber(raw.status),
    createdTime: toNumber(raw.createdTime),
    updatedTime: toNumber(raw.updatedTime),
    sheet: normalizeSheet(raw.sheet as RawSheet | undefined),
  };
}

// ==================== 登录（账号密码） ====================

export interface FenbiLoginResult {
  cookies: Record<string, string>;
  cookieHeader: string;
  fenbiUserId: string | null;
}

/**
 * loginV2 账号密码登录（调用方负责把密码做 RSA 加密）。
 *
 * @param passwordEncrypted `encryptPassword()` 的输出（base64）
 * @throws FenbiLoginError 粉笔明确拒绝（code !== 1）
 * @throws FenbiRiskControlError HTTP 430
 */
export async function fenbiLogin(
  phone: string,
  passwordEncrypted: string,
): Promise<FenbiLoginResult> {
  const body = new URLSearchParams({
    phone,
    password: passwordEncrypted,
    persistent: "true",
    app: "web",
  });

  const res = await fenbiRequest(
    `${LOGIN_BASE}/api/users/loginV2?kav=12&app=web&av=80`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );

  const json = await readJson<{
    code?: number;
    msg?: string;
    data?: { id?: number | string };
  }>(res, `${LOGIN_BASE}/api/users/loginV2`);

  if (json.code !== 1) {
    // serverMessage 只在服务端日志里用（路由层会给用户一句中文），
    // 里面不会有我们传上去的密码
    throw new FenbiLoginError(
      typeof json.code === "number" ? json.code : null,
      json.msg ?? "登录失败",
    );
  }

  const cookies = parseCookieJar(readSetCookies(res));
  return {
    cookies,
    cookieHeader: serializeCookieJar(cookies),
    fenbiUserId: toIdString(json.data?.id),
  };
}

// ==================== 扫码登录 ====================

export async function genQrCode(): Promise<{
  lgtoken: string;
  qrContent: string;
}> {
  const res = await fenbiRequest(`${QRCODE_BASE}/qrcode-login/api/gen_code`);
  const json = await readJson<{ lgtoken?: string; codeContent?: string }>(
    res,
    `${QRCODE_BASE}/qrcode-login/api/gen_code`,
  );
  if (!json.lgtoken || !json.codeContent) {
    throw new FenbiProtocolError(
      "粉笔二维码接口返回缺少 lgtoken / codeContent",
    );
  }
  return { lgtoken: json.lgtoken, qrContent: json.codeContent };
}

/**
 * 轮询扫码状态。
 *
 * **实测只验证过 `data: 1`（未扫码）**，其余取值按粉笔 Web 端惯例映射：
 * 2=已扫待确认、3=确认成功、4=过期/取消。确认成功时如果下发 cookie 就一并
 * 返回（设计文档 §2.2 明确"cookie 落地方式未验证"，所以这里两条路都留）。
 */
export async function queryQrStatus(lgtoken: string): Promise<{
  status: FenbiQrStatus;
  cookies: Record<string, string>;
}> {
  const res = await fenbiRequest(
    `${QRCODE_BASE}/qrcode-login/api/query_code_status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lgtoken }),
    },
  );

  const json = await readJson<{ code?: number; data?: unknown }>(
    res,
    `${QRCODE_BASE}/qrcode-login/api/query_code_status`,
  );

  const code = toNumber(json.data);
  let status: FenbiQrStatus;
  switch (code) {
    case 1:
      status = "pending";
      break;
    case 2:
      status = "scanned";
      break;
    case 3:
      status = "confirmed";
      break;
    case 4:
      status = "expired";
      break;
    default:
      // 未知码不谎报成功：按 pending 处理，由前端超时兜底
      status = "pending";
      break;
  }

  return {
    status,
    cookies: parseCookieJar(readSetCookies(res)),
  };
}

// ==================== 练习记录 ====================

export interface ListExercisesResult {
  /** -1 表示没有下一页；否则原样回传给下一次请求 */
  nextCursor: number;
  exercises: FenbiExerciseSummary[];
}

/**
 * 练习记录列表（倒序，`categoryId=-1` = 全部）。
 *
 * 注意：`sheet.type=1`（试卷/模考）**不在这个列表里**，那份数据只在
 * `webapi.fenbi.com`（对该机器一律 401）。所以列表里出现的 type 只会是 3，
 * `sync.ts` 仍然对 type!==3 的项显式记为 failed（防御上游改版）。
 */
export async function listExercises(
  cookie: string,
  options: { cursor?: number; count?: number } = {},
): Promise<ListExercisesResult> {
  const cursor = options.cursor ?? 0;
  const count = options.count ?? 20;
  const url =
    `${TIKU_BASE}/api/jsjyzhzz/category-exercises` +
    `?categoryId=-1&cursor=${cursor}&count=${count}&${WEB_VERSION_QUERY}`;

  const res = await fenbiRequest(url, { cookie });
  const json = await readJson<{
    cursor?: unknown;
    datas?: unknown;
    data?: { cursor?: unknown; datas?: unknown };
  }>(res, url);

  // 实测是顶层 {cursor, datas}；保留 .data 兜底（部分接口族会包一层）
  const payload = json.data ?? json;
  const rows = Array.isArray(payload.datas) ? payload.datas : [];
  const exercises = rows
    .map((row) => normalizeExerciseSummary(row as Record<string, unknown>))
    .filter((row): row is FenbiExerciseSummary => row !== null);

  const cursorValue = toNumber(payload.cursor);
  return {
    nextCursor: cursorValue === null ? -1 : cursorValue,
    exercises,
  };
}

/** 单条练习详情（含 userAnswers） */
export async function getExercise(
  cookie: string,
  exerciseId: string,
): Promise<FenbiExerciseDetail> {
  const url =
    `${TIKU_BASE}/api/jsjyzhzz/exercises/${encodeURIComponent(exerciseId)}` +
    `?${WEB_VERSION_QUERY}`;
  const res = await fenbiRequest(url, { cookie });
  const json = await readJson<
    Record<string, unknown> & { data?: Record<string, unknown> }
  >(res, url);
  const raw = (json.data ?? json) as Record<string, unknown>;

  const id = toIdString(raw.id) ?? exerciseId;
  // userAnswers 的 key 在实测数据里是 "0"/"1"（题序），旧版导出里是题目 globalId：
  // 两种都收下，归一化交给 mapper（它按 questionId 重新建索引）
  const answersRaw =
    raw.userAnswers && typeof raw.userAnswers === "object"
      ? (raw.userAnswers as Record<string, FenbiUserAnswerRaw>)
      : {};

  return {
    id,
    key: typeof raw.key === "string" ? raw.key : null,
    status: toNumber(raw.status),
    createdTime: toNumber(raw.createdTime),
    elapsedTime: toNumber(raw.elapsedTime),
    userAnswers: answersRaw,
    sheet: normalizeSheet(raw.sheet as RawSheet | undefined),
  };
}

/** 题目与答案（按 chunk 拉取后合并） */
export async function getQuestions(
  cookie: string,
  type: number,
  questionIds: Array<string | number>,
): Promise<FenbiQuestionsPayload> {
  const ids = questionIds
    .map((id) => toIdString(id))
    .filter((id): id is string => id !== null);

  if (ids.length === 0) return { questions: [] };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += QUESTION_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + QUESTION_CHUNK_SIZE));
  }

  const merged: FenbiQuestionsPayload = { materials: [], questions: [] };
  for (const chunk of chunks) {
    const url =
      `${TIKU_BASE}/api/jsjyzhzz/universal/questions` +
      `?type=${type}&questionIds=${chunk.join(",")}&${WEB_VERSION_QUERY}`;
    const res = await fenbiRequest(url, { cookie });
    const json = await readJson<
      FenbiQuestionsPayload & { data?: FenbiQuestionsPayload }
    >(res, url);
    const payload = json.data ?? json;
    if (Array.isArray(payload.materials)) {
      merged.materials = [...(merged.materials ?? []), ...payload.materials];
    }
    if (Array.isArray(payload.questions)) {
      merged.questions = [...merged.questions, ...payload.questions];
    }
  }

  return merged;
}

/** 仅供测试：常量与 cookie 解析行为 */
export const __test__ = {
  BROWSER_HEADERS,
  WEB_VERSION_QUERY,
  REQUEST_TIMEOUT_MS,
};
