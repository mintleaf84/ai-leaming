/**
 * `/api/external` —— 个人内容：笔记 / 思维导图
 *
 * 拆分自 `routes/external.ts`；路径、方法、schema、中间件与错误文案均未改动。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { knowledgeService } from "@/lib/services/knowledge";
import { mindmapService } from "@/lib/services/mindmap";
import { parsePagination } from "@/lib/api/pagination";
import {
  PaginationMetaSchema,
  PaginationQuerySchema,
  RateLimitedResponse,
  parsePositiveInt,
  requireIdentity,
  requireScopeMiddleware,
} from "./shared";

const app = new OpenAPIHono();

// ==================== 个人内容：笔记 / 导图 / SRS 概览 ====================
// 这三组读接口补的是「只靠 docs/api.md 能不能完成一件真实任务」的缺口：
// 笔记、思维导图、SRS 负载以前只有 Server Action，对 agent 等于不存在。
// 统一走 limit/offset/meta（docs/api.md §2 的口径），不做第二套分页形状。

// ---------- GET /notes ----------

const notesQuery = PaginationQuerySchema.extend({
  q: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("标题/正文关键词；不传返回全部（按更新时间倒序）"),
});

const NoteListItemSchema = z.object({
  id: z.number().int().describe("笔记 ID（取全文用 GET /notes/{id}）"),
  title: z.string().describe("标题"),
  preview: z.string().describe("正文前 200 字（列表只给预览，避免刷爆上下文）"),
  updatedAt: z.string().nullable().describe("更新时间（SQLite UTC 文本）"),
});

const notesRoute = createRoute({
  method: "get",
  path: "/notes",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "列出当前用户的笔记（可关键词搜索）",
  description:
    "只读接口，需 read 作用域。按更新时间倒序分页；传 `q` 时在标题与正文里做 LIKE 搜索。只返回预览（正文前 200 字），全文用 `GET /notes/{id}`。跨用户数据不可见。",
  request: { query: notesQuery },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(NoteListItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "笔记列表",
    },
    400: { description: "参数校验失败" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(notesRoute, async (c) => {
  const identity = requireIdentity(c);
  const query = c.req.valid("query");
  const { limit, offset } = parsePagination(query);
  const userId = identity.effectiveUserId;

  try {
    // 搜索走 SQL 分页入口：界面用的 searchNotes 先截 50 条再返回，
    // 拿来当 REST 会让 offset>=50 永远空页、total 也谎报 50（评审指出过）
    if (query.q) {
      const { items, total } = await knowledgeService.searchNotesPage(
        userId,
        query.q,
        { limit, offset },
      );
      return c.json(
        {
          data: items.map((note) => ({
            id: note.id,
            title: note.title,
            preview: note.preview ?? "",
            updatedAt: note.updated_at ?? null,
          })),
          meta: { limit, offset, total },
        },
        200,
      );
    }

    // 无关键词：复用服务层的排序口径，切片在内存里做（笔记总量是个人量级）
    const all = await knowledgeService.getNoteList(userId);
    const page = all.slice(offset, offset + limit).map((note) => ({
      id: note.id,
      title: note.title,
      preview: note.preview ?? "",
      updatedAt: note.updated_at ?? null,
    }));

    return c.json(
      { data: page, meta: { limit, offset, total: all.length } },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取笔记列表失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- GET /notes/{id} ----------

const notesDetailRoute = createRoute({
  method: "get",
  path: "/notes/{id}",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "读取一篇笔记的全文",
  description:
    "只读接口，需 read 作用域。返回标题、正文与时间戳；笔记不存在或不属于当前身份一律 404（不泄露 ID 是否存在）。",
  request: { params: z.object({ id: z.string().describe("笔记 ID") }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            title: z.string(),
            content: z.string().describe("正文（Markdown 源文）"),
            createdAt: z.string().nullable(),
            updatedAt: z.string().nullable(),
          }),
        },
      },
      description: "笔记全文",
    },
    400: { description: "笔记 ID 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "笔记不存在（或不属于当前身份）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(notesDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { id } = c.req.valid("param");
  const noteId = parsePositiveInt(id);
  if (noteId === null) {
    return c.json({ error: "笔记 ID 必须是正整数" }, 400);
  }

  // 这里直接查库而不是复用 knowledgeService.getNoteDetail：后者用 throw Error
  // 表达"不存在"，路由层只能靠匹配错误文案来分辨 404，文案一改就静默变成 500
  const [note] = await drizzleDb
    .select()
    .from(drizzleSchema.notes)
    .where(
      and(
        eq(drizzleSchema.notes.id, noteId),
        eq(drizzleSchema.notes.user_id, identity.effectiveUserId),
      ),
    )
    .limit(1);

  if (!note) {
    return c.json({ error: `笔记不存在：${noteId}` }, 404);
  }

  return c.json(
    {
      id: note.id,
      title: note.title,
      content: note.content ?? "",
      createdAt: note.created_at ?? null,
      updatedAt: note.updated_at ?? null,
    },
    200,
  );
});

// ---------- GET /mindmaps ----------

const MindmapListItemSchema = z.object({
  id: z.number().int().describe("导图 ID（取内容用 GET /mindmaps/{id}）"),
  title: z.string().describe("标题"),
  updatedAt: z.string().nullable().describe("更新时间（SQLite UTC 文本）"),
});

const mindmapsRoute = createRoute({
  method: "get",
  path: "/mindmaps",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "列出当前用户的思维导图",
  description:
    "只读接口，需 read 作用域。按更新时间倒序分页。只返回标题级信息，内容用 `GET /mindmaps/{id}`。跨用户数据不可见。",
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(MindmapListItemSchema),
            meta: PaginationMetaSchema,
          }),
        },
      },
      description: "思维导图列表",
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(mindmapsRoute, async (c) => {
  const identity = requireIdentity(c);
  const { limit, offset } = parsePagination(c.req.valid("query"));

  try {
    const all = await mindmapService.getList(identity.effectiveUserId);
    const page = all.slice(offset, offset + limit).map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updated_at ?? null,
    }));
    return c.json(
      { data: page, meta: { limit, offset, total: all.length } },
      200,
    );
  } catch (err) {
    logger.error({ err }, "[External] 读取思维导图列表失败");
    return c.json({ error: "服务器内部错误" }, 500);
  }
});

// ---------- GET /mindmaps/{id} ----------

const mindmapDetailRoute = createRoute({
  method: "get",
  path: "/mindmaps/{id}",
  middleware: [requireScopeMiddleware("read")] as const,
  summary: "读取一张思维导图的内容",
  description:
    "只读接口，需 read 作用域。`content` 是导图的 Markdown/大纲源文（与界面编辑器同一份字符串）。导图不存在或不属于当前身份一律 404。",
  request: { params: z.object({ id: z.string().describe("导图 ID") }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number().int(),
            title: z.string(),
            content: z.string().describe("导图内容（Markdown 大纲源文）"),
            createdAt: z.string().nullable(),
            updatedAt: z.string().nullable(),
          }),
        },
      },
      description: "思维导图内容",
    },
    400: { description: "导图 ID 不是正整数" },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 该 API Key 的作用域不足" },
    404: { description: "导图不存在（或不属于当前身份）" },
    429: RateLimitedResponse,
    500: { description: "服务器内部错误" },
  },
});

app.openapi(mindmapDetailRoute, async (c) => {
  const identity = requireIdentity(c);
  const { id } = c.req.valid("param");
  const mindmapId = parsePositiveInt(id);
  if (mindmapId === null) {
    return c.json({ error: "导图 ID 必须是正整数" }, 400);
  }

  const [row] = await drizzleDb
    .select()
    .from(drizzleSchema.mindmaps)
    .where(
      and(
        eq(drizzleSchema.mindmaps.id, mindmapId),
        eq(drizzleSchema.mindmaps.user_id, identity.effectiveUserId),
      ),
    )
    .limit(1);

  if (!row) {
    return c.json({ error: `导图不存在：${mindmapId}` }, 404);
  }

  return c.json(
    {
      id: row.id,
      title: row.title,
      content: row.content ?? "",
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    },
    200,
  );
});

// ---------- GET /srs/summary ----------

export default app;
