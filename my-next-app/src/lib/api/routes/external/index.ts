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

// 限流配额对象需要可写（单测会临时下调，见 external-ratelimit.test.ts）
export { externalRateLimits };

export default app;
