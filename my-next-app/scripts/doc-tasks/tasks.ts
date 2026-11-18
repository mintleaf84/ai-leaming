/**
 * 计划里的「4 个文档任务」——**只允许调用 `/api/external/*`**。
 *
 * 这是 AI-native 计划 P1 的验收口径：关掉浏览器、只给一份 docs/api.md 和一把 key，
 * agent 能不能端到端完成一件真实的学习任务。所以这里刻意做到：
 *
 * - **不 import 任何服务层**：每个请求都走 HTTP 形状的 `ApiRequest`，
 *   谁提供它都行（vitest 里是 `app.request`，脚本里是 `fetch`，MCP 里是工具调用）；
 * - **任务顺序即真实使用顺序**：导入作答 → 排今日清单 → 走一轮回忆复习 → 生成小结；
 * - **每条断言都针对"数据真的变了"**，而不是"接口回了 200"。
 *
 * 四个任务：
 *   1. `importAnswers` 批量导入作答（先 dryRun 预演，再真写，断言两次计数一致）
 *   2. `buildTodayPlan` 按错题 + 掌握度排出今日练习清单
 *   3. `reviewLoop` 从错题建回忆卡 → 提交一次复习 → 确认调度被推动
 *   4. `summarize` 读笔记 / 导图 / SRS 负载，产出一份小结
 */

export interface ApiResponse {
  status: number;
  // 刻意用 unknown：调用方必须自己收窄，避免"以为拿到了结构"的隐式 any
  body: unknown;
}

export type ApiRequest = (
  method: "GET" | "POST" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
) => Promise<ApiResponse>;

export class DocTaskError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "DocTaskError";
  }
}

function fail(message: string, detail?: unknown): never {
  throw new DocTaskError(message, detail);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** 统一的响应检查：非 2xx 直接把状态码与响应体抛出来，便于定位 */
async function expectOk(
  req: ApiRequest,
  method: Parameters<ApiRequest>[0],
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await req(method, path, body);
  if (res.status < 200 || res.status >= 300) {
    fail(`${method} ${path} 返回 ${res.status}`, res.body);
  }
  return res.body;
}

// ==================== 任务 1：导入作答 ====================

export interface ImportTaskResult {
  dryRunInserted: number;
  realInserted: number;
  sessionId: string;
  sessionsVisible: number;
}

/**
 * 先预演、再真写。
 *
 * 断言两件事：
 * - 预演报告条数与真写一致（否则"预演"就是假的，agent 没法靠它决策）；
 * - 真写之后会话真的能在 `/practice/sessions` 里查到（否则只是"接口回了 200"）。
 */
export async function importAnswers(
  req: ApiRequest,
  options: {
    sessionKey: string;
    answers: Array<Record<string, unknown>>;
    /** 重放场景：允许真写命中幂等（默认要求首次真写不命中） */
    allowReplay?: boolean;
  },
): Promise<ImportTaskResult> {
  const payload = { sessionKey: options.sessionKey, answers: options.answers };

  const dry = asRecord(
    await expectOk(req, "POST", "/practice/answers?dryRun=true", payload),
  );
  if (dry.dryRun !== true) fail("预演响应缺少 dryRun:true", dry);
  const dryRunInserted = num(dry.inserted);

  const real = asRecord(
    await expectOk(req, "POST", "/practice/answers", payload),
  );
  const realInserted = num(real.inserted);
  if (dryRunInserted !== realInserted) {
    fail(
      `预演与真写的条数不一致：dryRun=${dryRunInserted} real=${realInserted}`,
      real,
    );
  }
  if (!options.allowReplay && real.duplicated !== false) {
    fail("首次真写不应是幂等命中", real);
  }

  const sessions = asRecord(
    await expectOk(req, "GET", "/practice/sessions?limit=20"),
  );
  const list = asArray(sessions.data);
  const sessionId = str(real.sessionId);
  if (!sessionId) fail("真写响应缺少 sessionId", real);
  if (!list.some((item) => str(asRecord(item).id) === sessionId)) {
    fail("新会话在 /practice/sessions 里查不到", list);
  }

  return {
    dryRunInserted,
    realInserted,
    sessionId,
    sessionsVisible: list.length,
  };
}

// ==================== 任务 2：今日练习清单 ====================

export interface TodayPlan {
  weakestTags: string[];
  questionIds: number[];
  summary: string;
}

/**
 * 按错题 + 掌握度排今日清单。
 *
 * 刻意不调 `list_questions` 翻页找题：先用 `/stats` 拿薄弱点、用 `/wrong-book` 拿
 * 实际待练题、用 `/mastery` 交叉验证标签分数，三步拼出"今天做什么"。
 */
export async function buildTodayPlan(req: ApiRequest): Promise<TodayPlan> {
  const stats = asRecord(await expectOk(req, "GET", "/stats"));
  const wrongBook = asRecord(
    await expectOk(req, "GET", "/wrong-book?limit=20"),
  );
  const mastery = asRecord(await expectOk(req, "GET", "/mastery?limit=50"));

  const wrongItems = asArray(wrongBook.data);
  if (wrongItems.length === 0) fail("错题本是空的，无法排今日清单");

  const masteryRows = asArray(mastery.data).map(asRecord);
  // 掌握度接口按分数升序不明说，这里显式排序，避免依赖服务端顺序
  const sorted = [...masteryRows].sort((a, b) => num(a.score) - num(b.score));
  const weakestTags = sorted
    .slice(0, 3)
    .map((row) => str(row.tag))
    .filter((tag) => tag.length > 0);
  if (weakestTags.length === 0) fail("掌握度接口没有返回任何标签", masteryRows);

  // 只从"实际待练"的错题里挑，且优先挑落在薄弱标签上的
  const withTag = wrongItems.map(asRecord);
  const preferred = withTag.filter((item) =>
    asArray(item.tags).some((tag) => weakestTags.includes(str(tag))),
  );
  const pool = preferred.length > 0 ? preferred : withTag;
  const questionIds = pool
    .slice(0, 10)
    .map((item) => num(item.questionId))
    .filter((id) => id > 0);
  if (questionIds.length === 0) fail("错题项里没有可用的 questionId", pool[0]);

  const summary =
    `今日清单 ${questionIds.length} 题；薄弱标签：${weakestTags.join("、")}；` +
    `待复习错题共 ${wrongItems.length} 题，累计正确率 ${num(stats.accuracy)}%。`;

  return { weakestTags, questionIds, summary };
}

// ==================== 任务 3：建卡 → 复习 → 确认调度被推动 ====================

export interface ReviewLoopResult {
  cardId: number;
  deckKey: string;
  rating: string;
  nextDue: string;
  repsAfter: number;
  duplicate: boolean;
}

/**
 * 从错题建一张回忆卡，提交一次复习，再读回来确认调度真的推进了。
 *
 * 断言的是"库里的状态变了"：`state.reps` 从 0/无 变成 ≥1、`state.due` 有值。
 * 只看 200 无法区分"判分成功"与"什么都没写"。
 */
export async function reviewLoop(
  req: ApiRequest,
  options: {
    deckKey: string;
    cardId: string;
    cardPrompt: string;
    typed: string;
    /** 重放场景：允许首次提交被判成幂等（重放时 reps 不应继续增长） */
    allowReplay?: boolean;
  },
): Promise<ReviewLoopResult> {
  const deckFile = {
    schema: 1,
    deckId: options.deckKey,
    title: `错题回忆卡 ${options.deckKey}`,
    groups: [],
    cards: [
      {
        cardId: options.cardId,
        kind: "list",
        prompt: options.cardPrompt,
        verbatim: false,
        items: [
          { text: "教育目的", keywords: ["教育目的"] },
          { text: "教育方法", keywords: ["教育方法"] },
        ],
      },
    ],
  };

  await expectOk(req, "POST", "/recall/decks", {
    json: JSON.stringify(deckFile),
  });

  const detail = asRecord(
    await expectOk(req, "GET", `/recall/decks/${options.deckKey}?limit=10`),
  );
  const card = asArray(detail.data)
    .map(asRecord)
    .find((asRecord) => true);
  if (!card) fail("导入卡组后读不到卡片", detail);
  const cardId = num(card.cardId);
  if (cardId <= 0) fail("卡片缺少数字主键", card);

  const review = asRecord(
    await expectOk(req, "POST", "/recall/reviews", {
      cardId,
      typed: options.typed,
      clientKey: `doc-task-${options.deckKey}-${options.cardId}`,
    }),
  );
  if (!options.allowReplay && review.duplicate === true) {
    fail("首次提交被判成幂等重放", review);
  }

  const after = asRecord(await expectOk(req, "GET", `/recall/cards/${cardId}`));
  const state = asRecord(after.state);
  const repsAfter = num(state.reps);
  const nextDue = str(state.due);
  if (repsAfter < 1) fail("复习后 reps 没有推进", state);
  if (!nextDue) fail("复习后没有 due 时间，调度未落地", state);

  return {
    cardId,
    deckKey: options.deckKey,
    rating: str(review.rating),
    nextDue,
    repsAfter,
    duplicate: review.duplicate === true,
  };
}

// ==================== 任务 4：笔记 / 导图 / SRS 负载小结 ====================

export interface SummaryResult {
  noteCount: number;
  firstNoteTitle: string;
  firstNoteHasBody: boolean;
  mindmapCount: number;
  firstMindmapTitle: string;
  srsTotalCards: number;
  next7Days: { count: number; minutes: number };
  text: string;
}

/**
 * 读笔记 / 导图 / SRS 负载，拼一份"学习档案"小结。
 *
 * 断言：列表接口不该返回全文（`preview` 长度受限）、详情接口必须能拿到正文，
 * 否则 agent 只能看到标题、拿不到内容。
 */
export async function summarize(req: ApiRequest): Promise<SummaryResult> {
  const notes = asRecord(await expectOk(req, "GET", "/notes?limit=50"));
  const noteRows = asArray(notes.data).map(asRecord);
  if (noteRows.length === 0) fail("笔记列表为空，无法生成小结");
  const firstNote = noteRows[0];
  const preview = str(firstNote.preview);
  if (preview.length > 200)
    fail("列表返回了超长 preview（应限制 200 字）", preview.length);

  const noteDetail = asRecord(
    await expectOk(req, "GET", `/notes/${num(firstNote.id)}`),
  );
  const noteBody = str(noteDetail.content);

  const mindmaps = asRecord(await expectOk(req, "GET", "/mindmaps?limit=50"));
  const mindmapRows = asArray(mindmaps.data).map(asRecord);
  if (mindmapRows.length === 0) fail("导图列表为空，无法生成小结");
  const mindmapDetail = asRecord(
    await expectOk(req, "GET", `/mindmaps/${num(mindmapRows[0].id)}`),
  );
  if (!str(mindmapDetail.content)) fail("导图详情没有内容", mindmapDetail);

  const srs = asRecord(await expectOk(req, "GET", "/srs/summary"));
  const next7Days = asRecord(srs.next7Days);

  const text =
    `笔记 ${noteRows.length} 篇（首篇「${str(firstNote.title)}」正文 ${noteBody.length} 字）、` +
    `导图 ${mindmapRows.length} 张（首张「${str(mindmapRows[0].title)}」）、` +
    `SRS 卡 ${num(srs.totalCards)} 张，未来 7 天待复习 ${num(next7Days.count)} 张 / 约 ${num(next7Days.minutes)} 分钟。`;

  return {
    noteCount: noteRows.length,
    firstNoteTitle: str(firstNote.title),
    firstNoteHasBody: noteBody.length > 0,
    mindmapCount: mindmapRows.length,
    firstMindmapTitle: str(mindmapRows[0].title),
    srsTotalCards: num(srs.totalCards),
    next7Days: { count: num(next7Days.count), minutes: num(next7Days.minutes) },
    text,
  };
}

// ==================== 编排 ====================

export interface DocTaskFixtures {
  sessionKey: string;
  answers: Array<Record<string, unknown>>;
  deckKey: string;
  cardId: string;
  cardPrompt: string;
  typed: string;
}

export interface DocTaskResults {
  imported: ImportTaskResult;
  todayPlan: TodayPlan;
  review: ReviewLoopResult;
  summary: SummaryResult;
}

/**
 * 按真实使用顺序跑完 4 个任务：导入 → 排清单 → 复习 → 小结。
 *
 * 顺序是刻意的：今日清单要能反映刚导入的那批作答，所以导入必须在它前面；
 * 小结放最后，因为它读的是"这一轮之后"的状态。
 */
export async function runDocTasks(
  req: ApiRequest,
  fixtures: DocTaskFixtures,
  options: { allowReplay?: boolean } = {},
): Promise<DocTaskResults> {
  const imported = await importAnswers(req, {
    sessionKey: fixtures.sessionKey,
    answers: fixtures.answers,
    allowReplay: options.allowReplay,
  });
  const todayPlan = await buildTodayPlan(req);
  const review = await reviewLoop(req, {
    deckKey: fixtures.deckKey,
    cardId: fixtures.cardId,
    cardPrompt: fixtures.cardPrompt,
    typed: fixtures.typed,
    allowReplay: options.allowReplay,
  });
  const summary = await summarize(req);

  return { imported, todayPlan, review, summary };
}
