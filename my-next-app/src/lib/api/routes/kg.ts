/**
 * `/api/kg` —— 知识图谱只读接口（用户 JWT）。
 *
 * 地图页消费 `GET /graph`（节点 + 边，边含教材原句 evidence），筛选用
 * `GET /nodes`（平铺 + kind 过滤 + 统一分页）。写入只走
 * `POST /api/external/kg/import`（admin），这里没有写端点。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware } from "@/lib/api/middlewares/auth";
import { parsePagination } from "@/lib/api/pagination";
import { getKgGraph, listKgNodes } from "@/lib/services/kg";

const app = new OpenAPIHono();

const KgNodeSchema = z.object({
  nodeKey: z.string(),
  name: z.string(),
  kind: z.string(),
  page: z.number().int().nullable(),
});

const KgEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
  evidence: z.string(),
  page: z.number().int().nullable(),
});

const GraphRoute = createRoute({
  method: "get",
  path: "/graph",
  middleware: [authMiddleware] as const,
  summary: "章节知识地图（节点 + 边，边含教材原句）",
  description:
    "读接口，登录 JWT。返回该章全部节点与边（含 evidence 原句与印刷页），供地图页渲染；图谱内容全局共享，不含个人数据。",
  request: {
    query: z.object({
      chapter: z.string().describe("章节标识（如 ch1）"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            nodes: z.array(KgNodeSchema),
            edges: z.array(KgEdgeSchema),
          }),
        },
      },
      description: "章节图谱",
    },
    400: { description: "缺少 chapter" },
  },
});

app.openapi(GraphRoute, async (c) => {
  const { chapter } = c.req.valid("query");
  if (!chapter.trim()) {
    return c.json({ error: "缺少 chapter 参数" }, 400);
  }
  // 图谱全局共享：这里只按 chapter 过滤，不按用户裁剪（鉴权仅用于挡匿名访问）
  const graph = await getKgGraph(chapter);
  return c.json(
    {
      nodes: graph.nodes.map((node) => ({
        nodeKey: node.nodeKey,
        name: node.name,
        kind: node.kind,
        page: node.printedPage ?? null,
      })),
      edges: graph.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        evidence: edge.evidence,
        page: edge.printedPage ?? null,
      })),
    },
    200,
  );
});

const ListNodesRoute = createRoute({
  method: "get",
  path: "/nodes",
  middleware: [authMiddleware] as const,
  summary: "平铺节点列表（可筛 kind，limit/offset 分页）",
  description:
    "读接口，登录 JWT。按 `node_key` 升序返回平铺节点，供筛选器 / 下拉框使用；`kind` 可选（concept|facet|work|person|policy）。",
  request: {
    query: z.object({
      chapter: z.string().describe("章节标识（如 ch1）"),
      kind: z
        .string()
        .optional()
        .describe("节点类型过滤：concept|facet|work|person|policy"),
      limit: z.string().optional().describe("返回条数，默认 20，上限 100"),
      offset: z.string().optional().describe("偏移量，默认 0"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(KgNodeSchema),
            meta: z.object({
              limit: z.number().int(),
              offset: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
      description: "节点列表",
    },
    400: { description: "缺少 chapter" },
  },
});

app.openapi(ListNodesRoute, async (c) => {
  const { chapter, kind, limit, offset } = c.req.valid("query");
  if (!chapter.trim()) {
    return c.json({ error: "缺少 chapter 参数" }, 400);
  }

  const { limit: limitNum, offset: offsetNum } = parsePagination({
    limit,
    offset,
  });
  const { items, total } = await listKgNodes({
    chapter,
    kind,
    limit: limitNum,
    offset: offsetNum,
  });

  return c.json(
    {
      data: items.map((node) => ({
        nodeKey: node.nodeKey,
        name: node.name,
        kind: node.kind,
        page: node.printedPage ?? null,
      })),
      meta: { limit: limitNum, offset: offsetNum, total },
    },
    200,
  );
});

export default app;
