import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  CONTRACT_VERSION,
  FEATURES,
  LATEST_CLIENT_VERSION,
  MIN_CLIENT_VERSION,
  readMobileApkUrl,
} from "@/lib/contract/version";

/**
 * 公开契约协商端点（`GET /api/meta`）。
 *
 * **不要给它加 `authMiddleware`**：老客户端可能在登录前就调用它，而且「服务端太旧
 * 连登录都做不了」这种场景恰恰需要它在匿名状态下可用。契约守卫测试会读源码断言
 * 这一点，防止未来有人"顺手加上鉴权"把协商打死。
 *
 * 同样**不要加 `try/catch`**：这里不碰 IO，出错就是代码错了，兜底只会把 bug 变成
 * 一个"看起来正常"的响应。
 *
 * `Cache-Control: no-store`：契约协商结果不能吃缓存 —— 中间层缓存会让刚升级的
 * 服务端继续对客户端自报旧版本。
 */
const metaRoute = new OpenAPIHono();

const ContractMetaSchema = z.object({
  contractVersion: z
    .number()
    .int()
    .min(1)
    .describe("契约版本（整数，不兼容变更才 +1）"),
  minClientVersion: z.string().describe("服务端仍愿意服务的最低客户端版本"),
  latestClientVersion: z.string().describe("当前最新客户端版本"),
  downloadUrl: z
    .string()
    .nullable()
    .describe("APK 下载地址；未配置时为 null（不是空字符串）"),
  features: z.array(z.string()).describe("服务端具备的能力名（只增不减）"),
});

const getMetaRoute = createRoute({
  method: "get",
  path: "/",
  summary: "契约协商（版本 + 能力列表，公开无鉴权）",
  responses: {
    200: {
      description: "服务端契约信息",
      content: {
        "application/json": {
          schema: ContractMetaSchema,
        },
      },
    },
  },
});

metaRoute.openapi(getMetaRoute, (c) => {
  c.header("Cache-Control", "no-store");

  return c.json(
    {
      contractVersion: CONTRACT_VERSION,
      minClientVersion: MIN_CLIENT_VERSION,
      latestClientVersion: LATEST_CLIENT_VERSION,
      downloadUrl: readMobileApkUrl(),
      features: [...FEATURES],
    },
    200,
  );
});

export default metaRoute;
