/**
 * 外部开放接口（`/api/external/*`）的聚合入口。
 *
 * 原来是一个 3242 行的单文件；按资源拆成 `questions` / `srs` / `recall` /
 * `notes` / `misc` 五个子路由，公共设施（限流、鉴权包装、分页 schema）在
 * `shared.ts`。挂载顺序与中间件顺序保持拆分前一致：
 * 限流 → 写操作审计 → 全局 read 守卫 → 各资源路由。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { apiAuditForWrites } from "@/lib/api/audit";
import { requireScope } from "@/lib/api/middlewares/api-key";
import { externalRateLimits, rateLimitMiddleware } from "./shared";
import questionsRoutes from "./questions";
import srsRoutes from "./srs";
import recallRoutes from "./recall";
import notesRoutes from "./notes";
import miscRoutes from "./misc";
import kgRoutes from "./kg";
import agentSetsRoute from "../external-agent-sets";

const app = new OpenAPIHono();

// ==================== 限流 ====================
app.use("*", rateLimitMiddleware);

// ==================== 鉴权 / 审计中间件 ====================
// 审计先挂：这样未通过鉴权的写请求（401/403）也会留痕。
// 身份（key/user/scope）由 requireScope 解析并挂到 Context 上，审计中间件随后读取。

app.use("*", apiAuditForWrites());

/** 全局 read 守卫：所有外部接口至少要有 read 作用域，更高的作用域由路由自己声明 */
const readScopeGuard: MiddlewareHandler = async (c, next) => {
  const identity = await requireScope(c, "read");
  if (identity instanceof Response) return identity;
  await next();
};

app.use("*", readScopeGuard);

// ==================== 按资源挂载 ====================
// 各子路由的 path 是 `/api/external` 之后的绝对路径，因此统一挂在 "/" 上。
app.route("/", questionsRoutes);
app.route("/", miscRoutes);
app.route("/", recallRoutes);
app.route("/", notesRoutes);
app.route("/", srsRoutes);
// 知识图谱导入（docs/kg-product-plan.md §3）：admin + 绑定用户的 Key，
// 门禁与幂等都在子路由内；最终路径 `/api/external/kg/import`
app.route("/", kgRoutes);
// Agent 推题 / 题集（docs/agent-question-set-plan.md §4.1）：最终路径
// `/api/external/agent/question-sets...`；作用域与 key 绑定由子路由自己校验
app.route("/agent", agentSetsRoute);

// 限流配额对象需要可写（单测会临时下调，见 external-ratelimit.test.ts）
export { externalRateLimits };

export default app;
