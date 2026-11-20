import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getErrorMessage } from "@/lib/utils/error";
import { requireRole } from "@/lib/auth/auth";
import os from "os";
import fs from "fs";
import path from "path";
import { logAdminAction } from "@/lib/admin/audit";
import { getApiCallStats } from "@/lib/admin/api-stats-service";
import { questionFeedbackService } from "@/lib/services/question-feedback-service";
import { getDedupeStatus } from "@/lib/services/question-dedupe-cleanup";
import { logger } from "@/lib/logger";
import Papa from "papaparse";
import { getBeijingDateString } from "@/lib/utils/datetime";

export const adminRoute = new OpenAPIHono();

// --- Helper Functions ---

/**
 * 数据访问全部下沉在 `services/admin-service.ts`。
 *
 * 这里用动态 import 而不是顶层 import：admin-service 静态依赖向量索引
 * （`question-vector-index` → `ai/rag`），顶层引入会让所有加载本路由的进程
 * 顺带拉起重模块；同一个文件里 SQL 脚本服务已经是这个写法，保持一致。
 */
async function adminDb() {
  const { adminService } = await import("@/lib/services/admin-service");
  return adminService;
}

/** 鉴权类错误：只有这类才应转换成 401，数据库/网络故障必须冒泡 */
function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /unauthor|forbidden|未授权|无权限|未登录|请先登录|权限不足/i.test(
    message,
  );
}

/**
 * 公式注入防护（OWASP CSV Injection）：以 = + - @ 或制表符开头的单元格，
 * 在 Excel/WPS 里会被当成公式执行。加一个前导单引号让它们变成纯文本。
 *
 * 转义本身交给 papaparse（引号/逗号/换行的规则容易写错，且它处理 BOM 与换行更稳）。
 */
const CSV_INJECTION_PREFIX = /^[=+\-@\t\r]/;

function neutralizeCsvFormula(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return CSV_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

// --- Routes ---

/** GET /api/admin/system - 系统状态 */
const systemStatusDef = createRoute({
  method: "get",
  path: "/system",
  summary: "获取系统运行状态",
  responses: {
    200: { description: "成功返回系统信息" },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(systemStatusDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const adminService = await adminDb();
  const dbSize = await adminService.getDatabaseFileSize();

  const pkgPath = path.resolve(process.cwd(), "package.json");
  let appVersion = "v1.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.version) appVersion = `v${pkg.version}`;
  } catch (err) {
    // audit-allow: 可选元信息，读取失败用默认版本号
    logger.debug({ err, pkgPath }, "读取 package.json 版本失败");
  }

  return c.json({
    os: {
      platform: os.platform(),
      release: os.release(),
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      cpus: os.cpus().length,
      memory: { total: os.totalmem(), free: os.freemem() },
    },
    db: { size: dbSize, walSize: 0 },
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
    },
    ai: await getApiCallStats(),
    demoMode: await adminService.getDemoModeStatus(),
    appVersion,
    timestamp: Date.now(),
  });
});

/** POST /api/admin/system - 演示模式控制 */
const systemActionDef = createRoute({
  method: "post",
  path: "/system",
  summary: "执行系统管理操作（如演示模式开关）",
  responses: {
    200: { description: "操作成功" },
    400: { description: "无效操作" },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(systemActionDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const { action } = await c.req.json();
  const adminService = await adminDb();

  if (action === "toggle_demo_mode") {
    const current = await adminService.getDemoModeStatus();
    const newValue = !current;
    await adminService.setDemoMode(newValue);
    return c.json({ success: true, demoMode: newValue });
  }

  if (action === "reset_demo_session") {
    await adminService.resetDemoSession();
    return c.json({ success: true, message: "演示数据集已重置" });
  }

  return c.json({ error: "无效的操作" }, 400);
});

/** GET /api/admin/backup - 备份下载 */
const backupDef = createRoute({
  method: "get",
  path: "/backup",
  summary: "下载数据库备份",
  responses: {
    200: { description: "成功返回数据库二进制文件" },
    401: { description: "未授权" },
    500: { description: "备份失败" },
  },
});

adminRoute.openapi(backupDef, async (c) => {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const snapshot = await (await adminDb()).createBackupSnapshot(user);
  if (!snapshot) return c.json({ error: "Backup failed" }, 500);

  return c.body(snapshot.data, 200, {
    "Content-Disposition": `attachment; filename="${snapshot.filename}"`,
    "Content-Type": "application/x-sqlite3",
  });
});

/** POST /api/admin/restore - 数据库还原 */
const restoreDef = createRoute({
  method: "post",
  path: "/restore",
  summary: "上传并还原数据库",
  responses: {
    200: { description: "还原成功" },
    400: { description: "无效文件" },
    401: { description: "未授权" },
    500: { description: "还原失败" },
  },
});

adminRoute.openapi(restoreDef, async (c) => {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  try {
    const body = await c.req.parseBody();
    const file = body["file"] as File;
    if (!file) return c.json({ error: "No file uploaded" }, 400);

    // 安全加固：限制最大上传大小为 100MB，防止磁盘耗尽攻击 (DoS)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return c.json(
        {
          error: `文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，上限 100MB`,
        },
        400,
      );
    }

    // 校验、关连接、换文件、回滚的编排在 service：那条路径有进程级副作用，
    // 只允许在「已鉴权的管理员」入口触发（见 admin-service.restoreDatabase）。
    const result = await (
      await adminDb()
    ).restoreDatabase({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      actor: user,
    });

    if (!result.ok) {
      return result.backup
        ? c.json({ error: result.error, backup: result.backup }, result.status)
        : c.json({ error: result.error }, result.status);
    }

    return c.json({ success: true, backupCreated: result.backupCreated });
  } catch (error: unknown) {
    // audit-allow: 上传体解析失败（非 SQLite/表单损坏）统一 500 并附可读原因；
    //   库连接的重连已由 service 内部完成
    logger.error({ err: error }, "[Admin] 数据库恢复请求处理失败");
    return c.json({ error: "Restore failed: " + getErrorMessage(error) }, 500);
  }
});

/** GET /api/admin/backup-history - 备份历史记录 */
const backupHistoryDef = createRoute({
  method: "get",
  path: "/backup-history",
  summary: "获取备份与恢复操作的历史记录",
  responses: {
    200: { description: "成功返回历史记录" },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(backupHistoryDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const history = await (await adminDb()).getBackupHistory();

  return c.json({ history, total: history.length });
});

// --- Questions Export (Existing) ---

const ExportQuestionsQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  dimension: z.string().optional(),
});

const exportQuestionsDef = createRoute({
  method: "get",
  path: "/export/questions",
  summary: "导出题库为CSV",
  request: { query: ExportQuestionsQuerySchema },
  responses: {
    200: {
      content: { "text/csv": { schema: z.string() } },
      description: "CSV 文件数据",
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(exportQuestionsDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const { search, tag, dimension } = c.req.valid("query");

  const questions = await (
    await adminDb()
  ).listQuestionsForExport({ search, tag, dimension });

  const headers = [
    "ID",
    "类型",
    "维度",
    "题干",
    "选项",
    "答案",
    "解析",
    "标签",
    "正确率(%)",
    "创建时间",
  ];
  const rows: unknown[][] = [
    headers,
    ...questions.map((q) => [
      q.id,
      q.type,
      q.dimension,
      q.content,
      q.options,
      q.answer,
      q.explanation,
      q.tags,
      q.correct_ratio,
      q.created_at,
    ]),
  ];

  // BOM 必须放在最前面：没有它 Excel 打开中文会乱码
  const csvContent =
    "\uFEFF" +
    Papa.unparse(
      rows.map((row) => row.map(neutralizeCsvFormula)),
      {
        quotes: false,
        newline: "\n",
      },
    ) +
    "\n";

  const fileName = `questions_export_${getBeijingDateString()}.csv`;
  return c.text(csvContent, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}"`,
  });
});

// --- 题目纠错反馈管理 ---

const listFeedbackDef = createRoute({
  method: "get",
  path: "/feedback",
  summary: "获取反馈列表",
  request: {
    query: z.object({
      status: z.enum(["pending", "resolved", "dismissed"]).optional(),
      feedback_type: z
        .enum(["wrong_answer", "wrong_content", "wrong_explanation", "other"])
        .optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: "反馈列表",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.number(),
                question_id: z.number(),
                question_content: z.string().nullable(),
                user_id: z.number(),
                username: z.string().nullable(),
                feedback_type: z.string(),
                description: z.string().nullable(),
                status: z.string(),
                created_at: z.string().nullable(),
                resolved_at: z.string().nullable(),
              }),
            ),
            total: z.number(),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(listFeedbackDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const query = c.req.valid("query");
  const result = await questionFeedbackService.list({
    limit: query.limit,
    offset: query.offset,
    status: query.status,
    feedback_type: query.feedback_type,
  });
  return c.json(result, 200);
});

const resolveFeedbackDef = createRoute({
  method: "post",
  path: "/feedback/{id}/resolve",
  summary: "标记反馈为已解决",
  request: {
    params: z.object({ id: z.coerce.number().int() }),
  },
  responses: {
    200: {
      description: "操作成功",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(resolveFeedbackDef, async (c) => {
  let adminUser;
  try {
    adminUser = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const { id } = c.req.valid("param");
  await questionFeedbackService.resolve(id, adminUser.id);
  await logAdminAction(
    adminUser.id,
    adminUser.username,
    "RESOLVE_FEEDBACK",
    "feedback",
    String(id),
    { feedbackId: id },
  );
  return c.json({ success: true }, 200);
});

const dismissFeedbackDef = createRoute({
  method: "post",
  path: "/feedback/{id}/dismiss",
  summary: "忽略反馈",
  request: {
    params: z.object({ id: z.coerce.number().int() }),
  },
  responses: {
    200: {
      description: "操作成功",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(dismissFeedbackDef, async (c) => {
  let adminUser;
  try {
    adminUser = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const { id } = c.req.valid("param");
  await questionFeedbackService.dismiss(id, adminUser.id);
  await logAdminAction(
    adminUser.id,
    adminUser.username,
    "DISMISS_FEEDBACK",
    "feedback",
    String(id),
    { feedbackId: id },
  );
  return c.json({ success: true }, 200);
});

const feedbackCountsDef = createRoute({
  method: "get",
  path: "/feedback/counts",
  summary: "获取反馈状态计数",
  responses: {
    200: {
      description: "状态计数",
      content: {
        "application/json": {
          schema: z.object({
            pending: z.number(),
            resolved: z.number(),
            dismissed: z.number(),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(feedbackCountsDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  const counts = await questionFeedbackService.getStatusCounts();
  return c.json(counts, 200);
});

// ==================== SQL Scripts ====================

const validateSqlDef = createRoute({
  method: "post",
  path: "/sql-scripts/validate",
  summary: "验证 SQL 脚本安全性",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            sql: z.string().min(1, "SQL 不能为空"),
            description: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "验证结果",
      content: {
        "application/json": {
          schema: z.object({
            valid: z.boolean(),
            error: z.string().optional(),
            warnings: z.array(z.string()).optional(),
            estimatedRows: z.number().nullable().optional(),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(validateSqlDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const { sql: sqlContent } = await c.req.json();
  const { SqlScriptService } =
    await import("@/lib/services/sql-script-service");

  const validation = SqlScriptService.validateScript(sqlContent);

  if (
    validation.valid &&
    (sqlContent.toUpperCase().includes("DELETE") ||
      sqlContent.toUpperCase().includes("UPDATE"))
  ) {
    const rows = await SqlScriptService.estimateRowsAffected(sqlContent);
    validation.estimatedRows = rows ?? undefined;
  }

  return c.json(validation, 200);
});

const executeSqlDef = createRoute({
  method: "post",
  path: "/sql-scripts/execute",
  summary: "执行 SQL 脚本（自动备份）",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            sql: z.string().min(1, "SQL 不能为空"),
            description: z.string().min(1, "脚本描述不能为空"),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "执行结果",
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            rowsAffected: z.number().optional(),
            error: z.string().optional(),
            backupPath: z.string().optional(),
            executionTime: z.number().optional(),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(executeSqlDef, async (c) => {
  let adminUser;
  try {
    adminUser = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const { sql: sqlContent, description } = await c.req.json();
  const { SqlScriptService } =
    await import("@/lib/services/sql-script-service");

  const result = await SqlScriptService.executeWithBackup(
    sqlContent,
    description,
    adminUser.id,
  );

  return c.json(result, 200);
});

const getSqlHistoryDef = createRoute({
  method: "get",
  path: "/sql-scripts/history",
  summary: "获取 SQL 脚本执行历史",
  responses: {
    200: {
      description: "执行历史",
      content: {
        "application/json": {
          schema: z.object({
            history: z.array(
              z.object({
                id: z.number(),
                timestamp: z.string().or(z.date()),
                userId: z.number(),
                description: z.string(),
                success: z.boolean(),
                rowsAffected: z.number().nullable(),
                executionTime: z.number().nullable(),
                backupFile: z.string().nullable(),
                error: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(getSqlHistoryDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const { SqlScriptService } =
    await import("@/lib/services/sql-script-service");
  const history = await SqlScriptService.getExecutionHistory();

  return c.json({ history }, 200);
});

const cleanupSqlBackupsDef = createRoute({
  method: "post",
  path: "/sql-scripts/cleanup",
  summary: "清理过期的 SQL 脚本备份",
  responses: {
    200: {
      description: "清理结果",
      content: {
        "application/json": {
          schema: z.object({
            deleted: z.number(),
            error: z.string().optional(),
          }),
        },
      },
    },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(cleanupSqlBackupsDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401；数据库故障等继续冒泡为 500
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const { SqlScriptService } =
    await import("@/lib/services/sql-script-service");
  const result = await SqlScriptService.cleanupOldBackups();

  return c.json(result, 200);
});

/** GET /api/admin/maintenance/dedupe - 数据维护状态（重复题/兜底题/未回填哈希） */
const dedupeStatusDef = createRoute({
  method: "get",
  path: "/maintenance/dedupe",
  summary: "数据维护状态",
  responses: {
    200: { description: "返回待处理项计数" },
    401: { description: "未授权" },
  },
});

adminRoute.openapi(dedupeStatusDef, async (c) => {
  try {
    await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }
  return c.json(await getDedupeStatus(), 200);
});

/**
 * POST /api/admin/maintenance/dedupe - 兜底题重复清理
 *
 * body: { apply?: boolean }——默认 false 只预检；true 时先 VACUUM INTO 备份再执行。
 * 幂等：重复执行不会二次迁移/删除（见 question-dedupe-cleanup.ts）。
 */
const dedupeRunDef = createRoute({
  method: "post",
  path: "/maintenance/dedupe",
  summary: "执行兜底题重复清理（apply 前自动备份）",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ apply: z.boolean().optional().default(false) }),
        },
      },
    },
  },
  responses: {
    200: { description: "返回清理报告与备份路径" },
    401: { description: "未授权" },
    500: { description: "清理失败（数据库未按预期变更时请先查日志）" },
  },
});

adminRoute.openapi(dedupeRunDef, async (c) => {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (err) {
    // audit-allow: 仅把鉴权类错误转换为 401
    if (isAuthError(err)) return c.json({ error: "Unauthorized" }, 401);
    throw err;
  }

  const { apply } = c.req.valid("json");
  const result = await (await adminDb()).runDedupe({ apply, actor: user });

  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json(
    { ok: true, report: result.report, backupPath: result.backupPath },
    200,
  );
});
