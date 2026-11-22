import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { masteryService } from "@/lib/services/mastery";
import { getNodeMastery } from "@/lib/services/kg";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { parsePagination } from "@/lib/api/pagination";

const app = new OpenAPIHono();

// --- Schemas ---

// Recursive schema definition in Zod is tricky for OpenAPI generation sometimes.
// simpler approach: output flat arrays or limited depth for API if recursive fails,
// but let's try defining the node schema.
const _MasteryNodeSchema = z.object({
  name: z.string(),
  path: z.string(),
  score: z.number(),
  level: z.number(),
});

// For the responding tree, we might just define it as a generic object or recursive if possible.
// Zod recursive:
// const NodeSchema: z.ZodType<MasteryTreeNode> = z.lazy(() => MasteryNodeSchema.extend({ children: z.array(NodeSchema) }))
// But for OpenAPI Hono, we might need 'z.array(z.any())' for children to avoid complexity if strict typing isn't needed for swagger UI deep nesting.
const MasteryTreeResponseSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    score: z.number(),
    level: z.number(),
    children: z.array(z.record(z.string(), z.unknown())), // Use z.record(z.unknown()) for children to avoid recursive schema issues in simple setup
  }),
);

const HierarchyStatsSchema = z.object({
  avgScore: z.number(),
  count: z.number(),
});

// --- Routes ---

const MasteryTagEntrySchema = z.object({
  tag: z.string(),
  score: z.number(),
  correctCount: z.number().int(),
  totalCount: z.number().int(),
  accuracy: z.number().int(),
  lastUpdated: z.string().nullable(),
});

const MasteryNodeEntrySchema = z.object({
  nodeKey: z.string(),
  name: z.string(),
  answered: z.number().int(),
  correctRate: z.number().int(),
});

/**
 * GET /api/mastery?by=tag|node
 *
 * `by` 缺省 = `tag`，与外部只读接口 `/api/external/mastery` 同一份口径
 * （读 `user_mastery`，每个标签一行）。`by=node` 是**新增的并行视图**，
 * 直接聚合 `practice_logs` + `question_nodes`，不写也不会改 `user_mastery`：
 * - tag 口径回答「哪个考点弱」；
 * - node 口径回答「教材结构里哪个节点弱」（同题多节点会各计一次）。
 * 两者刻意不互相覆盖（docs/kg-product-plan.md §2）。
 */
const getMasteryRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  summary: "掌握度列表（by=tag 或缺省 / by=node）",
  description:
    "登录 JWT。`by` 缺省（或 `tag`）时返回按标签的掌握度，形状与既有外部接口一致；`by=node` 时按知识图谱节点聚合 practice_logs，需同时传 `chapter`。两个口径互不覆盖。",
  request: {
    query: z.object({
      by: z
        .enum(["tag", "node"])
        .optional()
        .default("tag")
        .describe("聚合口径：tag（默认，读 user_mastery）| node（聚合 practice_logs）"),
      chapter: z
        .string()
        .optional()
        .describe("章节标识（by=node 时必填，如 ch1）"),
      limit: z.string().optional().describe("返回条数，默认 20，上限 100"),
      offset: z.string().optional().describe("偏移量，默认 0"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.union([
              z.array(MasteryTagEntrySchema),
              z.array(MasteryNodeEntrySchema),
            ]),
            meta: z.object({
              limit: z.number().int(),
              offset: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
      description: "掌握度列表（by=tag 或 by=node）",
    },
    400: { description: "by=node 时缺少 chapter" },
  },
});

app.openapi(getMasteryRoute, async (c) => {
  const user = getCurrentUser(c);
  const { by, chapter, limit, offset } = c.req.valid("query");
  const { limit: limitNum, offset: offsetNum } = parsePagination({
    limit,
    offset,
  });

  if (by === "node") {
    if (!chapter || !chapter.trim()) {
      return c.json({ error: "by=node 时必须提供 chapter" }, 400);
    }
    const { items, total } = await getNodeMastery(Number(user.id), chapter, {
      limit: limitNum,
      offset: offsetNum,
    });
    return c.json(
      {
        data: items,
        meta: { limit: limitNum, offset: offsetNum, total },
      },
      200,
    );
  }

  const { items, total } = await masteryService.getMasteryEntries(
    Number(user.id),
    { limit: limitNum, offset: offsetNum },
  );
  return c.json(
    {
      data: items,
      meta: { limit: limitNum, offset: offsetNum, total },
    },
    200,
  );
});

// GET /api/v1/mastery/tree
const getTreeRoute = createRoute({
  method: "get",
  path: "/tree",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "Get user mastery tree",
      content: {
        "application/json": {
          schema: MasteryTreeResponseSchema,
        },
      },
    },
  },
});

app.openapi(getTreeRoute, async (c) => {
  const user = getCurrentUser(c);
  const tree = await masteryService.getMasteryTree(Number(user.id));
  // 响应 schema 里的 children 是"宽松记录"（z.record），而 MasteryTreeNode 的
  // children 是递归数组（JSONValue 联合）。运行时载荷一致，这里只做类型对齐；
  // 换成递归 z.lazy schema 会改动契约快照，不值得为一次依赖升级付这个代价。
  return c.json(tree as unknown as z.infer<typeof MasteryTreeResponseSchema>);
});

// GET /api/v1/mastery/stats?tag=failed
const getStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  middleware: [authMiddleware] as const,
  request: {
    query: z.object({
      tag: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Get statistics for a specific tag hierarchy",
      content: {
        "application/json": {
          schema: HierarchyStatsSchema,
        },
      },
    },
  },
});

app.openapi(getStatsRoute, async (c) => {
  const user = getCurrentUser(c);
  const { tag } = c.req.valid("query");

  const stats = await masteryService.getHierarchyMastery(Number(user.id), tag);
  return c.json(stats);
});

export default app;
