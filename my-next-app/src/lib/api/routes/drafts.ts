import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import { draftService, type DraftItemPatch } from "@/lib/services/draft-service";

const app = new OpenAPIHono();

const DraftItemSchema = z.object({
  idx: z.number().int(),
  content: z.string(),
  options: z.array(z.string()),
  answer: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
  type: z.string(),
  material_html: z.string().nullable(),
  confirmed: z.boolean(),
});

const DraftSchema = z.object({
  id: z.string(),
  user_id: z.number().int(),
  source: z.enum(["camera", "gallery", "text", "pdf"]),
  status: z.enum([
    "captured",
    "analyzing",
    "ready",
    "failed",
    "confirmed",
    "discarded",
  ]),
  image_sha256: z.string().nullable(),
  image_rel_path: z.string().nullable(),
  ai_provider: z.string().nullable(),
  ai_model: z.string().nullable(),
  ai_prompt_version: z.string().nullable(),
  ai_raw_json: z.string().nullable(),
  error_code: z.string().nullable(),
  created_at: z.string().nullable(),
  expires_at: z.number().int().nullable(),
});

const DraftWithItemsSchema = z.object({
  draft: DraftSchema,
  items: z.array(DraftItemSchema),
});

const DraftIdParam = z.object({ id: z.string().min(1) });

// ---------------- POST /api/drafts ----------------

const createDraftRoute = createRoute({
  method: "post",
  path: "/",
  middleware: [authMiddleware] as const,
  summary: "创建草稿（可带 base64 图片）",
  description:
    "图片按 sha256 落 `data/drafts/<sha256>` 去重；请求体用 base64（`data:image/...;base64,` 前缀可选），不引入 multipart。source=text 时传 `text`。",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            source: z.enum(["camera", "gallery", "text", "pdf"]),
            image_base64: z.string().max(20_000_000).optional(),
            image_mime_type: z.string().optional(),
            file_name: z.string().optional(),
            text: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: DraftWithItemsSchema } },
      description: "草稿已创建（status=captured）",
    },
    400: { description: "参数/图片不合法" },
    401: { description: "未登录" },
  },
});

app.openapi(createDraftRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const body = c.req.valid("json");
    const result = await draftService.create(user.id, body);
    return c.json(result, 201);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.create" });
  }
});

// ---------------- POST /api/drafts/{id}/analyze ----------------

const analyzeDraftRoute = createRoute({
  method: "post",
  path: "/{id}/analyze",
  middleware: [authMiddleware] as const,
  summary: "触发 AI 识别（OCR + 结构化）",
  description:
    "写 `analyzing` → 成功 `ready` + items；失败 `failed` + `error_code` 且可重试（本次仍返回 200，客户端按 status 展示重试入口）。",
  request: { params: DraftIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: DraftWithItemsSchema.extend({ ok: z.boolean() }),
        },
      },
      description: "识别结束：ok=false 时 status=failed，error_code 为失败原因",
    },
    401: { description: "未登录" },
    404: { description: "草稿不存在，或不属于当前用户" },
    409: { description: "当前状态不允许识别（已确认/已丢弃/已就绪）" },
  },
});

app.openapi(analyzeDraftRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const { id } = c.req.valid("param");
    const result = await draftService.analyze(user.id, id);
    return c.json(result, 200);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.analyze" });
  }
});

// ---------------- GET /api/drafts/{id} ----------------

const getDraftRoute = createRoute({
  method: "get",
  path: "/{id}",
  middleware: [authMiddleware] as const,
  summary: "草稿详情（含 items）",
  request: { params: DraftIdParam },
  responses: {
    200: {
      content: { "application/json": { schema: DraftWithItemsSchema } },
      description: "草稿与识别条目",
    },
    401: { description: "未登录" },
    404: { description: "草稿不存在，或不属于当前用户" },
  },
});

app.openapi(getDraftRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const { id } = c.req.valid("param");
    const result = await draftService.get(user.id, id);
    return c.json(result, 200);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.get" });
  }
});

// ---------------- PATCH /api/drafts/{id}/items/{idx} ----------------

const patchItemRoute = createRoute({
  method: "patch",
  path: "/{id}/items/{idx}",
  middleware: [authMiddleware] as const,
  summary: "修改/删除单条草稿条目",
  description:
    "只改传了的字段；`confirmed` 由前端显式置位；`deleted=true` 删除该条（idx 不重排）。",
  request: {
    params: z.object({ id: z.string().min(1), idx: z.string() }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              content: z.string().optional(),
              options: z.array(z.string()).optional(),
              answer: z.string().optional(),
              explanation: z.string().optional(),
              tags: z.array(z.string()).optional(),
              type: z.string().optional(),
              material_html: z.string().nullable().optional(),
              confirmed: z.boolean().optional(),
              deleted: z.boolean().optional(),
            })
            .refine((value) => Object.keys(value).length > 0, {
              message: "至少要改一个字段",
            }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DraftWithItemsSchema } },
      description: "更新后的草稿",
    },
    400: { description: "参数不合法" },
    401: { description: "未登录" },
    404: { description: "草稿/条目不存在，或不属于当前用户" },
    409: { description: "草稿已确认/已丢弃，条目不可再改" },
  },
});

app.openapi(patchItemRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const { id, idx } = c.req.valid("param");
    const itemIdx = Number(idx);
    if (!Number.isInteger(itemIdx) || itemIdx < 0) {
      return c.json({ error: "条目下标必须是非负整数" }, 400);
    }
    const body = c.req.valid("json") as DraftItemPatch;
    const result = await draftService.updateItem(user.id, id, itemIdx, body);
    return c.json(result, 200);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.update-item" });
  }
});

// ---------------- POST /api/drafts/{id}/confirm ----------------

const confirmDraftRoute = createRoute({
  method: "post",
  path: "/{id}/confirm",
  middleware: [authMiddleware] as const,
  summary: "确认入库（单事务）",
  description:
    "把 `confirmed=1` 的条目写成 questions：任一失败整体回滚，草稿仍 ready。幂等键 `draft:<draftId>:<idx>`，重复确认 `created=0`、`conflicts` 指向已存在的题目。",
  request: { params: DraftIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            created: z.number().int(),
            skipped: z.number().int(),
            conflicts: z.number().int(),
            questionIds: z.array(z.number().int()),
          }),
        },
      },
      description: "确认结果",
    },
    400: { description: "条目校验失败（带 issues），本次零写入" },
    401: { description: "未登录" },
    404: { description: "草稿不存在，或不属于当前用户" },
    409: { description: "草稿已丢弃" },
  },
});

app.openapi(confirmDraftRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const { id } = c.req.valid("param");
    const result = await draftService.confirm(user.id, id, {
      username: user.username,
    });
    return c.json(result, 200);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.confirm" });
  }
});

// ---------------- DELETE /api/drafts/{id} ----------------

const discardDraftRoute = createRoute({
  method: "delete",
  path: "/{id}",
  middleware: [authMiddleware] as const,
  summary: "丢弃草稿（软删除）",
  request: { params: DraftIdParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            status: z.literal("discarded"),
          }),
        },
      },
      description: "已丢弃（重复调用幂等）",
    },
    401: { description: "未登录" },
    404: { description: "草稿不存在，或不属于当前用户" },
  },
});

app.openapi(discardDraftRoute, async (c) => {
  try {
    const user = getCurrentUser(c);
    const { id } = c.req.valid("param");
    const result = await draftService.discard(user.id, id);
    return c.json(result, 200);
  } catch (error) {
    return toErrorResponse(c, error, { scope: "drafts.discard" });
  }
});

export default app;
