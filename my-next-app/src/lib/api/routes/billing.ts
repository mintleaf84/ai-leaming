import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getAllPlans } from "@/lib/billing/subscription-service";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { getErrorMessage } from "@/lib/utils/error";
import { logger } from "@/lib/logger";

const app = new OpenAPIHono();

// GET /plans — 套餐列表（Flutter pricing_screen 读 data['plans']，plan 字段
// name/slug/priceCents/features；slug 对应 subscription_plans.id）
const listPlansRoute = createRoute({
  method: "get",
  path: "/plans",
  middleware: [authMiddleware] as const,
  request: {},
  responses: {
    200: {
      description: "套餐列表",
      content: {
        "application/json": {
          schema: z.object({
            plans: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string(),
                priceCents: z.number(),
                features: z.array(z.string()),
              }),
            ),
          }),
        },
      },
    },
    401: { description: "未授权" },
    500: { description: "服务器错误" },
  },
});

app.openapi(listPlansRoute, async (c) => {
  const user = getCurrentUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const rows = await getAllPlans(true);
    return c.json({
      plans: rows.map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.id,
        priceCents: plan.price_monthly,
        features: plan.features,
      })),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Hono Billing API] listPlans error");
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

export default app;
