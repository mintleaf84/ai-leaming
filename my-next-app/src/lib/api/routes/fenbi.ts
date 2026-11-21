/**
 * 粉笔账号同步 REST（docs/fenbi-sync-design.md §5，Web / App 共用）。
 *
 * ## 六条端点
 *
 * ```
 * GET    /status          绑定状态 + 上次同步摘要
 * POST   /link            手机号 + 密码绑定
 * POST   /qrcode          生成扫码二维码
 * GET    /qrcode/status   轮询扫码状态（confirmed 时落地 cookie）
 * POST   /sync            立即同步（每用户 60s 限频）
 * DELETE /link            解绑并清除密码/cookie
 * ```
 *
 * ## 错误文案
 *
 * 粉笔的原始异常（HTTP 430 / code 11 / contextId）**一律不外抛**：用户看到的
 * 只有中文可读文案 + 机器码。原因有两层——(1) 原始信息里可能带上下文 id 与
 * 账号相关字段；(2) "430" 这种字符串对用户没有任何行动指引。
 *
 * ## 限频
 *
 * `syncThrottle` 是**进程内 Map**：单实例部署（本仓库当前形态）下够用；
 * 多实例/Serverless 部署时每个实例各算各的，需要换 Redis 之类的共享存储。
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";

import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { toErrorResponse } from "@/lib/api/error-response";
import { BusinessError, isAppError } from "@/lib/errors/app-error";
import { log } from "@/lib/logger";

import {
  FenbiAuthError,
  FenbiHttpError,
  FenbiLoginError,
  FenbiNetworkError,
  FenbiProtocolError,
  FenbiRiskControlError,
  genQrCode,
  queryQrStatus,
  fenbiLogin,
} from "@/lib/fenbi/client";
import {
  FenbiSecretUnavailableError,
  canStoreSecret,
  encryptSecret,
} from "@/lib/fenbi/crypto";
import { encryptPassword, FenbiPasswordEncryptError } from "@/lib/fenbi/rsa";
import {
  assertPhoneFormat,
  getFenbiStatus,
  linkFenbiAccount,
  syncFenbiForUser,
  unlinkFenbiAccount,
} from "@/lib/fenbi/sync";

const app = new OpenAPIHono();

/** 同步限频窗口：60 秒（设计文档 §5） */
const SYNC_COOLDOWN_MS = 60_000;
/**
 * 每用户上次同步时间。
 * 注意：进程内状态，单实例前提；重启清空（重启后允许立刻同步，可接受）。
 */
const syncThrottle = new Map<number, number>();

// ==================== 共享 schema ====================

const StatusSchema = z.object({
  linked: z.boolean(),
  phoneMasked: z.string().nullable(),
  fenbiUserId: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  lastResult: z
    .object({
      imported: z.number(),
      skipped: z.number(),
      newQuestions: z.number(),
      failed: z.array(z.object({ exerciseId: z.string(), reason: z.string() })),
    })
    .nullable(),
  status: z.enum(["active", "expired", "revoked"]).nullable(),
  syncable: z.literal(true),
  /** 如实告知能力边界：试卷/模考记录接口未开放 */
  unsupported: z.array(z.string()),
});

const SyncResultSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  newQuestions: z.number(),
  failed: z.array(z.object({ exerciseId: z.string(), reason: z.string() })),
});

// ==================== 错误映射 ====================

function errorBody<S extends 400 | 429 | 500 | 502>(
  c: Context,
  error: string,
  code: string,
  status: S,
) {
  return c.json({ error, code }, status);
}

/**
 * 所有端点共用的错误响应声明。
 * 挂到 createRoute.responses 里，OpenAPI 快照才能如实列出错误分支；
 * 少声明一个状态码时 Hono 的类型层会直接报错（不会静默漏文档）。
 */
const ERROR_RESPONSES = {
  400: { description: "参数错误 / 未绑定 / 登录态失效 / 未配置加密密钥" },
  429: { description: "粉笔风控（430）或本地同步限频（每用户 60 秒）" },
  500: { description: "服务器内部错误" },
  502: { description: "粉笔不可达或返回异常" },
} as const;

/**
 * 把粉笔/加密层异常翻成中文文案。
 * 返回 null 表示"不认识"，交给 `toErrorResponse`（AppError）或 500 兜底。
 */
function mapFenbiError(c: Context, error: unknown) {
  if (error instanceof FenbiRiskControlError) {
    // 430 是阿里云 fpr 滑块：重试只会更糟（§2.1 明确"不要自动重试"）
    log.warn(`[fenbi] 触发风控 contextId=${error.contextId ? "已记录" : "无"}`);
    return errorBody(
      c,
      "粉笔触发了安全验证，请稍后再试（短时间内不要重复绑定）",
      "fenbi.risk_control",
      429,
    );
  }
  if (error instanceof FenbiSecretUnavailableError) {
    // 扫码 confirmed 后落库时才可能触发（密码绑定在入口已拦）：给明确原因，
    // 不要退化成笼统的 500「服务器内部错误」
    return errorBody(c, error.message, "fenbi.secret_unavailable", 400);
  }
  if (error instanceof FenbiAuthError) {
    return errorBody(
      c,
      "粉笔登录态已失效，请重新绑定账号",
      "fenbi.auth_expired",
      400,
    );
  }
  if (error instanceof FenbiLoginError) {
    // 服务端 msg 只进日志（不含用户输入），对外统一文案
    log.warn(`[fenbi] 登录被拒绝 code=${error.code ?? "unknown"}`);
    return errorBody(c, "手机号或密码错误", "fenbi.login_rejected", 400);
  }
  if (error instanceof FenbiSecretUnavailableError) {
    return errorBody(c, error.message, "fenbi.secret_unavailable", 400);
  }
  if (error instanceof FenbiPasswordEncryptError) {
    return errorBody(c, error.message, "fenbi.password_invalid", 400);
  }
  if (
    error instanceof FenbiNetworkError ||
    error instanceof FenbiProtocolError
  ) {
    return errorBody(
      c,
      "暂时无法连接粉笔，请稍后再试",
      "fenbi.upstream_unavailable",
      502,
    );
  }
  if (error instanceof FenbiHttpError) {
    log.warn(`[fenbi] 上游 HTTP ${error.status}`);
    return errorBody(
      c,
      "粉笔返回了异常响应，请稍后再试",
      "fenbi.upstream_error",
      502,
    );
  }
  return null;
}

function respondError(c: Context, error: unknown, scope: string) {
  const mapped = mapFenbiError(c, error);
  if (mapped) return mapped;
  if (isAppError(error)) return toErrorResponse(c, error, { scope });
  log.error({ err: error, scope }, "[fenbi] 未归类异常");
  return c.json({ error: "服务器内部错误", code: "internal" }, 500);
}

// ==================== GET /status ====================

const statusDef = createRoute({
  method: "get",
  path: "/status",
  summary: "粉笔绑定状态与上次同步摘要",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "绑定状态",
      content: { "application/json": { schema: StatusSchema } },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(statusDef, async (c) => {
  const user = getCurrentUser(c);
  const status = await getFenbiStatus(Number(user.id));
  return c.json(
    {
      ...status,
      syncable: true as const,
      // 不假装全同步：试卷/模考只存在于 webapi.fenbi.com（401，鉴权未知）
      unsupported: ["paper"],
    },
    200,
  );
});

// ==================== POST /link ====================

const LinkBodySchema = z.object({
  phone: z.string().min(5).max(20),
  password: z.string().min(1).max(64),
});

const linkDef = createRoute({
  method: "post",
  path: "/link",
  summary: "手机号 + 密码绑定粉笔账号",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: { "application/json": { schema: LinkBodySchema } },
    },
  },
  responses: {
    200: {
      description: "绑定成功",
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(linkDef, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  const body = c.req.valid("json");

  try {
    const phone = assertPhoneFormat(body.phone);

    // 设计文档 §3：缺 FENBI_SECRET 时禁止存密码，只允许扫码
    if (!canStoreSecret()) {
      return errorBody(
        c,
        "服务端未配置 FENBI_SECRET，暂不支持密码绑定，请使用扫码绑定",
        "fenbi.secret_unavailable",
        400,
      );
    }

    const passwordEnc = encryptPassword(body.password);
    const login = await fenbiLogin(phone, passwordEnc);

    if (!login.cookieHeader) {
      // 登录返回 code=1 却没下发 cookie：上游改版，别把"绑定成功"报给用户
      log.warn("[fenbi] 登录成功但未下发 cookie");
      return errorBody(
        c,
        "粉笔未返回登录凭证，请改用扫码绑定",
        "fenbi.login_no_cookie",
        502,
      );
    }

    await linkFenbiAccount(userId, {
      phone,
      fenbiUserId: login.fenbiUserId,
      cookie: login.cookieHeader,
      // 复用已有的 AES-GCM 实现（同 FENBI_SECRET 口径）
      passwordEnc: encryptSecret(body.password),
    });

    log.info(`[fenbi] 用户 ${userId} 密码绑定成功`);
    return c.json({ ok: true as const }, 200);
  } catch (error) {
    // audit-allow: 已交给 respondError 统一映射（它内部会记结构化日志并回中文文案）
    return respondError(c, error, "fenbi.link");
  }
});

// ==================== POST /qrcode ====================

const QrCodeSchema = z.object({
  lgtoken: z.string(),
  qrContent: z.string(),
});

const qrcodeDef = createRoute({
  method: "post",
  path: "/qrcode",
  summary: "生成扫码登录二维码",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "二维码",
      content: { "application/json": { schema: QrCodeSchema } },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(qrcodeDef, async (c) => {
  try {
    const qr = await genQrCode();
    return c.json(qr, 200);
  } catch (error) {
    // audit-allow: 已交给 respondError 统一映射（它内部会记结构化日志并回中文文案）
    return respondError(c, error, "fenbi.qrcode");
  }
});

// ==================== GET /qrcode/status ====================

const QrStatusQuery = z.object({ lgtoken: z.string().min(1) });

const qrStatusDef = createRoute({
  method: "get",
  path: "/qrcode/status",
  summary: "轮询扫码状态",
  middleware: [authMiddleware] as const,
  request: { query: QrStatusQuery },
  responses: {
    200: {
      description: "扫码状态",
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["pending", "scanned", "confirmed", "expired"]),
            /** confirmed 且已成功落地 cookie 时为 true */
            linked: z.boolean(),
          }),
        },
      },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(qrStatusDef, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  const { lgtoken } = c.req.valid("query");

  try {
    const result = await queryQrStatus(lgtoken);

    if (result.status !== "confirmed") {
      return c.json({ status: result.status, linked: false }, 200);
    }

    // 设计文档 §2.2：扫码成功后 cookie 的落地方式未验证。
    // 有 cookie 就立刻存库（不存密码、不存手机号）；没有 cookie 时如实回
    // linked:false —— 前端提示"扫码已确认但未取得凭证，请改用密码绑定"。
    const cookieHeader = Object.entries(result.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");

    if (!cookieHeader) {
      log.warn("[fenbi] 扫码 confirmed 但未下发 cookie");
      return c.json({ status: "confirmed" as const, linked: false }, 200);
    }

    await linkFenbiAccount(userId, {
      phone: null,
      fenbiUserId: null,
      cookie: cookieHeader,
      passwordEnc: null,
    });
    log.info(`[fenbi] 用户 ${userId} 扫码绑定成功`);
    return c.json({ status: "confirmed" as const, linked: true }, 200);
  } catch (error) {
    // audit-allow: 已交给 respondError 统一映射（它内部会记结构化日志并回中文文案）
    return respondError(c, error, "fenbi.qrcode-status");
  }
});

// ==================== POST /sync ====================

const SyncBodySchema = z.object({ full: z.boolean().optional() });

const syncDef = createRoute({
  method: "post",
  path: "/sync",
  summary: "立即同步粉笔做题记录",
  middleware: [authMiddleware] as const,
  request: {
    body: {
      // full 可省略：允许客户端不带 body 直接 POST /sync
      required: false,
      content: { "application/json": { schema: SyncBodySchema } },
    },
  },
  responses: {
    200: {
      description: "同步结果",
      content: { "application/json": { schema: SyncResultSchema } },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(syncDef, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  const body = c.req.valid("json") as { full?: boolean } | undefined;

  const now = Date.now();
  const last = syncThrottle.get(userId) ?? 0;
  const remainingMs = SYNC_COOLDOWN_MS - (now - last);
  if (remainingMs > 0) {
    return c.json(
      {
        error: `同步太频繁，请 ${Math.ceil(remainingMs / 1000)} 秒后再试`,
        code: "fenbi.sync_throttled",
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      },
      429,
    );
  }

  // 先占位再执行：并发双击只会有一个进入同步，另一个拿到 429
  syncThrottle.set(userId, now);

  try {
    const summary = await syncFenbiForUser(userId, {
      full: body?.full === true,
    });
    return c.json(summary, 200);
  } catch (error) {
    // audit-allow: 已交给 respondError 统一映射（它内部会记结构化日志并回中文文案）
    // 登录态失效 / 未绑定时释放限频窗口：用户重新绑定后应当能立刻重试
    if (error instanceof BusinessError) syncThrottle.delete(userId);
    return respondError(c, error, "fenbi.sync");
  }
});

// ==================== DELETE /link ====================

const unlinkDef = createRoute({
  method: "delete",
  path: "/link",
  summary: "解绑粉笔账号并清除密码/cookie",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "解绑成功",
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
    },
    ...ERROR_RESPONSES,
  },
});

app.openapi(unlinkDef, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);
  try {
    await unlinkFenbiAccount(userId);
    log.info(`[fenbi] 用户 ${userId} 已解绑粉笔账号`);
    return c.json({ ok: true as const }, 200);
  } catch (error) {
    // audit-allow: 已交给 respondError 统一映射（它内部会记结构化日志并回中文文案）
    return respondError(c, error, "fenbi.unlink");
  }
});

export default app;
