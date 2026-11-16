import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { log } from "@/lib/logger";
import { webVitalsService } from "@/lib/services/web-vitals";

/**
 * 前端性能指标采集（docs/performance.md T-01）。
 *
 * 匿名接口，不挂 authMiddleware：指标与用户身份无关，而且页面可能在登录前
 * 就上报（/login 的 LCP）。只接受固定字段，写库失败静默返回 204 —— 观测数据
 * 丢失不影响任何业务。
 */
const vitalsRoute = new OpenAPIHono();

const submitVitalsDef = createRoute({
  method: "post",
  path: "/",
  summary: "上报一条 Web Vitals 采样（匿名）",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.enum(["INP", "LCP", "CLS", "TTFB", "FCP"]),
            value: z.number().finite().nonnegative(),
            route: z.string().min(1).max(200),
            rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
          }),
        },
      },
    },
  },
  responses: {
    204: { description: "已接收" },
    400: { description: "参数错误" },
  },
});

vitalsRoute.openapi(submitVitalsDef, async (c) => {
  const body = await c.req.valid("json");
  try {
    await webVitalsService.record(body);
  } catch (error) {
    // audit-allow: 指标上报失败不能变成 5xx，否则会在弱网下制造噪声。
    // 记一条 error 后仍然返回 204（降级：数据丢失可接受，见文件头注释）
    log.error("[vitals] 写入失败", error);
    return c.body(null, 204);
  }
  return c.body(null, 204);
});

export default vitalsRoute;
