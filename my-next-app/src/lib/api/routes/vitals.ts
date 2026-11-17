import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { log } from "@/lib/logger";
import { checkRateLimit, getClientIP } from "@/lib/auth/rate-limit";
import { webVitalsService, VITAL_NAMES, type VitalKind } from "@/lib/services/web-vitals";

/**
 * 前端性能指标采集（docs/performance.md T-01 / P2-02）。
 *
 * 匿名接口，不挂 authMiddleware：指标与用户身份无关，而且页面可能在登录前
 * 就上报（/login 的 LCP）。只接受固定字段，写库失败静默返回 204 —— 观测数据
 * 丢失不影响任何业务。
 *
 * 但"匿名 + 写库"必须有上限：否则任何外部调用方都能把它当成 INSERT 放大器。
 * 这里按客户端 IP 走内存限流（与 /api/auth/* 同一套实现），超额直接 429、
 * 不写库。单用户正常量级是"每次交互一条"，每分钟 120 次足够；nav 采样
 * 在客户端侧另有 30 条/页的上限。
 */
const vitalsRoute = new OpenAPIHono();

const submitVitalsDef = createRoute({
  method: "post",
  path: "/",
  summary: "上报一条性能采样（匿名，按 IP 限流）",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            // vital = Core Web Vitals；launch = 首屏可交互；nav = 单次交互耗时
            kind: z.enum(["vital", "launch", "nav"]).optional(),
            name: z.string().min(1).max(20),
            value: z.number().finite().nonnegative(),
            route: z.string().min(1).max(200),
            rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
            /** 仅 kind=nav：这次交互是在哪一页发生的 */
            fromRoute: z.string().min(1).max(200).optional(),
          }),
        },
      },
    },
  },
  responses: {
    204: { description: "已接收" },
    400: { description: "参数错误" },
    429: { description: "超出上报频率" },
  },
});

vitalsRoute.openapi(submitVitalsDef, async (c) => {
  const body = await c.req.valid("json");

  // 指标名与 kind 必须匹配（不用 superRefine：会让 zod-openapi 无法注册 schema）
  const kind: VitalKind = body.kind ?? "vital";
  if (!VITAL_NAMES[kind].includes(body.name)) {
    return c.json(
      {
        error: `kind=${kind} 时 name 必须是 ${VITAL_NAMES[kind].join(" / ")}`,
      },
      400,
    );
  }

  const rateLimit = checkRateLimit(getClientIP(c.req.raw), "/api/vitals");
  if (!rateLimit.success) {
    return c.body(null, 429);
  }

  try {
    await webVitalsService.record({ ...body, kind });
  } catch (error) {
    // audit-allow: 指标上报失败不能变成 5xx，否则会在弱网下制造噪声。
    // 记一条 error 后仍然返回 204（降级：数据丢失可接受，见文件头注释）
    log.error("[vitals] 写入失败", error);
    return c.body(null, 204);
  }
  return c.body(null, 204);
});

export default vitalsRoute;
