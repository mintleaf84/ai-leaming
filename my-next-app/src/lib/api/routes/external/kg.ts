/**
 * `/api/external/kg` —— 教综知识图谱导入（admin 作用域，且 Key 必须绑定用户）。
 *
 * 产品里**不做** PDF 解析与抽边：离线管线（`~/data/jiaozong_1680/kg/`）产出并人工
 * 审过的 JSON 从这里进库。接口只负责三件事：
 * 1. 跑门禁（`src/lib/kg/validate.ts`：类型/证据/无环/覆盖率/schema 版本）；
 * 2. 事务内幂等写入（`src/lib/services/kg.ts`）；
 * 3. 把覆盖率与告警原样回报，缺口当场可见。
 *
 * 任何门禁失败一律 400 且一条都不写；`?dryRun=true` 只算不写。
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { applyKgImport, previewKgImport } from "@/lib/services/kg";
import { validateKgImport } from "@/lib/kg/validate";
import { RELATION_TYPES_VERSION } from "@/lib/kg/relation-types";
import {
  DryRunQuerySchema,
  RateLimitedResponse,
  requireIdentity,
  requireScopeMiddleware,
  wantsDryRun,
} from "./shared";

const app = new OpenAPIHono();

const SectionSchema = z.object({
  key: z.string().describe("考点标识（如 考点一）"),
  title: z.string().describe("考点标题"),
  startPage: z.number().int().describe("起始页码（教材印刷页，闭区间）"),
  endPage: z.number().int().describe("结束页码（闭区间）"),
});

const NodeSchema = z.object({
  nodeKey: z
    .string()
    .describe("节点 key，章内唯一；`ch1:名称` 或裸名称（导入时补 `<chapter>:` 前缀）"),
  name: z.string().describe("节点名称"),
  kind: z
    .string()
    .describe("节点类型：concept | facet | work | person | policy"),
  printedPage: z.number().int().nullable().optional().describe("首个出现的印刷页"),
});

const EdgeSchema = z.object({
  from: z.string().describe("起点（节点 key 或裸名称）"),
  to: z.string().describe("终点（节点 key 或裸名称）"),
  type: z.string().describe("关系类型（必须已登记）"),
  evidence: z.string().describe("教材原句（硬约束，不得为空）"),
  printed_page: z.number().int().nullable().optional().describe("印刷页"),
  note: z.string().optional().describe("离线管线备注，不入库"),
});

const ImportBodySchema = z.object({
  chapter: z.string().describe("章节标识（如 ch1），用于节点 key 前缀与读接口过滤"),
  schemaVersion: z
    .string()
    .describe(`关系类型登记表版本，必须等于 ${RELATION_TYPES_VERSION}`),
  sections: z
    .array(SectionSchema)
    .describe("考点清单：覆盖率门禁按它逐节检查，空清单直接拒绝"),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

const CoverageSchema = z.object({
  covered: z.number().int(),
  total: z.number().int(),
  missing: z.array(SectionSchema),
});

const ImportRoute = createRoute({
  method: "post",
  path: "/kg/import",
  middleware: [requireScopeMiddleware("admin")] as const,
  summary: "导入一章知识图谱（门禁 + 幂等，需绑定用户的 admin Key）",
  description:
    "写接口，**需 admin 作用域且 API Key 必须绑定 userId**（图谱是全局资产，但写入必须能追溯到具体用户）。导入前跑门禁：schemaVersion 必须等于当前登记表版本；节点 key 章内唯一；边类型已登记、evidence 非空、无自环、无重复、prerequisite 无环且 facet 不作先修端点；每个 section 至少命中一条边。**任一门禁失败返回 400 且一条都不写。** 幂等键 `(chapter,node_key)` 与 `(chapter,from,to,type)`：重导同一份数据返回 skipped=全部。预演传 `?dryRun=true`，只返回 wouldCreate / coverage / warnings，库内零变更。",
  request: {
    query: DryRunQuerySchema,
    body: { content: { "application/json": { schema: ImportBodySchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            dryRun: z.boolean().optional(),
            wouldCreateNodes: z.number().int().optional(),
            wouldCreateEdges: z.number().int().optional(),
            wouldUpdateNodes: z.number().int().optional(),
            wouldUpdateEdges: z.number().int().optional(),
            created: z
              .object({ nodes: z.number().int(), edges: z.number().int() })
              .optional(),
            updated: z
              .object({ nodes: z.number().int(), edges: z.number().int() })
              .optional(),
            skipped: z
              .object({ nodes: z.number().int(), edges: z.number().int() })
              .optional(),
            coverage: CoverageSchema,
            warnings: z.array(z.string()),
          }),
        },
      },
      description: "导入结果（预演时只含 wouldCreate*，真导时含 created/updated/skipped）",
    },
    400: {
      description: "门禁失败（issues 逐条说明；coverage.missing 列出未覆盖考点）",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            issues: z.array(z.string()),
            codes: z.array(z.string()),
            coverage: CoverageSchema.optional(),
            warnings: z.array(z.string()).optional(),
          }),
        },
      },
    },
    401: { description: "未授权 - 缺少 / 无效 / 已停用的 API Key" },
    403: { description: "已禁止 - 需要 admin 作用域，且 Key 必须绑定用户" },
    429: RateLimitedResponse,
  },
});

app.openapi(ImportRoute, async (c) => {
  const identity = requireIdentity(c);
  // 全局 Key 没有绑定用户：图谱写入要能回答"这批数据是谁导的"，因此直接拒绝，
  // 而不是退化成"以站长身份写入"（审计里会看不出真实操作者）。
  if (identity.isGlobal || identity.userId === null) {
    return c.json(
      {
        error:
          "该接口要求 API Key 绑定用户（全局 Key 无 userId，无法追溯导入者）；请在管理端用绑定用户的 admin Key 调用",
      },
      403,
    );
  }

  const body = c.req.valid("json");
  const dryRun = wantsDryRun(c.req.valid("query"));

  const result = validateKgImport(body);

  if (result.issues.length > 0) {
    return c.json(
      {
        error: "图谱校验失败（未写入任何数据）",
        issues: result.issues.map((issue) => `[${issue.code}] ${issue.message}`),
        codes: Array.from(new Set(result.issues.map((issue) => issue.code))),
        coverage: result.coverage,
        warnings: result.warnings,
      },
      400,
    );
  }

  if (dryRun) {
    const preview = await previewKgImport({
      chapter: body.chapter,
      schemaVersion: body.schemaVersion,
      nodes: result.nodes,
      edges: result.edges,
    });
    return c.json(
      {
        dryRun: true as const,
        ...preview,
        coverage: result.coverage,
        warnings: result.warnings,
      },
      200,
    );
  }

  const outcome = await applyKgImport({
    chapter: body.chapter,
    schemaVersion: body.schemaVersion,
    nodes: result.nodes,
    edges: result.edges,
  });

  return c.json(
    {
      ...outcome,
      coverage: result.coverage,
      warnings: result.warnings,
    },
    200,
  );
});

export default app;
