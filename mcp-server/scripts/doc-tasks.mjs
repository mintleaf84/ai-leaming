#!/usr/bin/env node
/**
 * 计划 P3 的验收：**纯靠 MCP 工具**跑完与 `scripts/doc-tasks/tasks.ts` 同一组 4 个任务。
 *
 * 和 HTTP 版的区别只是传输层：这里不拼 URL、不带 Authorization，全部走
 * `tools/call`。所以它同时验证两件事：
 *   1. MCP 工具面足以覆盖真实任务（不是只有"查题库"那几条）；
 *   2. 工具描述与参数映射没写错（路径参数、query/body 分流都由 server 负责）。
 *
 * 环境变量：
 *   AI_LEAMING_BASE_URL   后端地址（由 run.ts 启动的临时实例）
 *   AI_LEAMING_API_KEY    write 作用域 key
 *   MCP_SERVER_ENTRY      server 入口（默认 ../dist/index.js）
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry =
  process.env.MCP_SERVER_ENTRY ?? join(here, "..", "dist", "index.js");

// ==================== stdio JSON-RPC 客户端 ====================

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    AI_LEAMING_BASE_URL: process.env.AI_LEAMING_BASE_URL ?? "",
    AI_LEAMING_API_KEY: process.env.AI_LEAMING_API_KEY ?? "",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter(message);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${method} 超时（30s）`)),
      30_000,
    );
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

/** 调一个工具并把 content[0].text（JSON）解出来；工具报错即抛 */
async function callTool(name, args = {}) {
  const message = await rpc("tools/call", { name, arguments: args });
  if (message.error) {
    throw new Error(`${name} 调用失败：${JSON.stringify(message.error)}`);
  }
  const text = message.result?.content?.[0]?.text ?? "";
  if (message.result?.isError) {
    throw new Error(`${name} 返回错误：${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ==================== 4 个任务 ====================

function fail(message, detail) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

async function importAnswers(sessionKey) {
  const pool = await callTool("list_questions", { limit: 3 });
  const questions = (pool.data ?? []).slice(0, 3);
  if (questions.length < 2) fail("题库题目不足，无法完成任务 1", pool);

  const answers = questions.map((question, index) => ({
    questionId: question.id,
    // 第一道答错、其余按题库答案答对：制造"有错题可练"的真实起点
    userAnswer: index === 0 ? "__wrong__" : (question.answer ?? "A"),
    isCorrect: index !== 0,
    durationMs: 9000,
  }));

  const dry = await callTool("import_answers", {
    sessionKey,
    answers,
    dryRun: true,
  });
  if (dry.dryRun !== true) fail("预演响应缺少 dryRun", dry);

  const real = await callTool("import_answers", { sessionKey, answers });
  if (dry.inserted !== real.inserted) {
    fail(`预演与真写条数不一致：${dry.inserted} vs ${real.inserted}`, real);
  }
  if (real.duplicated !== false) fail("首次真写不应命中幂等", real);

  const sessions = await callTool("list_practice_sessions", { limit: 10 });
  const visible = (sessions.data ?? []).some((s) => s.id === real.sessionId);
  if (!visible) fail("新会话在练习列表里查不到", sessions);

  return { dryRunInserted: dry.inserted, inserted: real.inserted };
}

async function buildTodayPlan() {
  const overview = await callTool("get_overview");
  const wrongBook = await callTool("get_wrong_book", { limit: 20 });
  const mastery = await callTool("get_mastery", { limit: 50 });

  const wrongItems = wrongBook.data ?? [];
  if (wrongItems.length === 0) fail("错题本为空，无法排今日清单", wrongBook);

  const tags = (mastery.data ?? [])
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((row) => row.tag)
    .filter(Boolean);
  if (tags.length === 0) fail("掌握度没有返回标签", mastery);

  const preferred = wrongItems.filter((item) =>
    (item.tags ?? []).some((tag) => tags.includes(tag)),
  );
  const pool = preferred.length > 0 ? preferred : wrongItems;
  const questionIds = pool
    .slice(0, 10)
    .map((item) => item.questionId)
    .filter((id) => typeof id === "number" && id > 0);
  if (questionIds.length === 0) fail("错题项没有 questionId", pool[0]);

  return {
    questionIds,
    weakTags: tags,
    accuracy: overview.accuracy,
  };
}

async function reviewLoop(deckKey) {
  const deckFile = {
    schema: 1,
    deckId: deckKey,
    title: `错题回忆卡 ${deckKey}`,
    groups: [],
    cards: [
      {
        cardId: "c1",
        kind: "list",
        prompt: "教育活动的两个基本要素是什么？",
        verbatim: false,
        items: [
          { text: "教育目的", keywords: ["教育目的"] },
          { text: "教育方法", keywords: ["教育方法"] },
        ],
      },
    ],
  };

  await callTool("import_recall_deck", { json: JSON.stringify(deckFile) });

  const deck = await callTool("get_recall_deck", { deckKey, limit: 10 });
  const card = (deck.data ?? [])[0];
  if (!card) fail("导入卡组后读不到卡片", deck);

  const review = await callTool("submit_review", {
    cardId: card.cardId,
    typed: "教育目的 教育方法",
    clientKey: `mcp-doc-task-${deckKey}`,
  });
  if (review.duplicate === true) fail("首次提交被判成幂等重放", review);

  // get_recall_card 的 cardId 是 path 参数（字符串），而列表里返回的是数字
  const after = await callTool("get_recall_card", {
    cardId: String(card.cardId),
  });
  const state = after.state ?? {};
  if ((state.reps ?? 0) < 1) fail("复习后 reps 没有推进", state);
  if (!state.due) fail("复习后没有 due，调度未落地", state);

  return { cardId: card.cardId, reps: state.reps, due: state.due };
}

async function summarize() {
  const notes = await callTool("list_notes", { limit: 50 });
  const noteRows = notes.data ?? [];
  if (noteRows.length === 0) fail("笔记为空，无法生成小结", notes);
  const note = await callTool("get_note", { id: noteRows[0].id });
  if (!note.content) fail("笔记详情没有正文", note);

  const mindmaps = await callTool("list_mindmaps", { limit: 50 });
  const mindmapRows = mindmaps.data ?? [];
  if (mindmapRows.length === 0) fail("导图为空，无法生成小结", mindmaps);
  const mindmap = await callTool("get_mindmap", { id: mindmapRows[0].id });
  if (!mindmap.content) fail("导图详情没有内容", mindmap);

  const srs = await callTool("get_srs_summary");

  return {
    notes: noteRows.length,
    noteChars: note.content.length,
    mindmaps: mindmapRows.length,
    srsCards: srs.totalCards ?? 0,
    next7Days: srs.next7Days ?? { count: 0, minutes: 0 },
  };
}

// ==================== 入口 ====================

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "doc-tasks", version: "0.0.0" },
  });
  if (!init.result?.capabilities?.tools) fail("initialize 未声明 tools 能力");
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );

  const tools = (await rpc("tools/list", {})).result?.tools ?? [];

  const imported = await importAnswers(`mcp-doc-task-${Date.now()}`);
  const plan = await buildTodayPlan();
  const review = await reviewLoop("deck-mcp-doc-task");
  const summary = await summarize();

  console.log(
    `✔ MCP 文档任务全部通过（工具 ${tools.length} 个）\n` +
      `  任务1 导入：预演 ${imported.dryRunInserted} → 真写 ${imported.inserted} 条\n` +
      `  任务2 今日清单：${plan.questionIds.length} 题，薄弱标签 ${plan.weakTags.join("/")}\n` +
      `  任务3 复习：card ${review.cardId} reps=${review.reps} due=${review.due}\n` +
      `  任务4 小结：笔记 ${summary.notes} 篇 / 导图 ${summary.mindmaps} 张 / SRS ${summary.srsCards} 张`,
  );
} catch (error) {
  console.error(`✖ MCP 文档任务失败：${error.message}`);
  if (error.detail) console.error(JSON.stringify(error.detail).slice(0, 800));
  process.exit(1);
} finally {
  child.kill();
}
