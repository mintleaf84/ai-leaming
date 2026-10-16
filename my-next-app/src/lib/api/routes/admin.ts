import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getErrorMessage } from "@/lib/utils/error";
import { drizzleDb, drizzleSchema, closeDb, reinitDb } from "@/lib/db";
import { requireRole } from "@/lib/auth/auth";
import { eq, and, sql, desc, like, exists } from "drizzle-orm";
import os from "os";
import fs from "fs";
import path from "path";
import { logAdminAction } from "@/lib/admin/audit";
import { getApiCallStats } from "@/lib/admin/api-stats-service";
import { questionFeedbackService } from "@/lib/services/question-feedback-service";
import type { Dimension } from "@/types";

export const adminRoute = new OpenAPIHono();

// --- Helper Functions ---

async function getDemoModeStatus(): Promise<boolean> {
  try {
    const row = await drizzleDb.query.system_settings.findFirst({
      where: and(
        eq(drizzleSchema.system_settings.key, "demo_mode_enabled"),
        eq(drizzleSchema.system_settings.user_id, 0),
      ),
    });
    return row?.value === "true";
  } catch {
    return false;
  }
}

function escapeCsv(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
  let dbSize = 0;
  try {
    dbSize = fs.statSync(dbPath).size;
  } catch {}

  const pkgPath = path.resolve(process.cwd(), "package.json");
  let appVersion = "v1.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.version) appVersion = `v${pkg.version}`;
  } catch {}

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
    demoMode: await getDemoModeStatus(),
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { action } = await c.req.json();

  if (action === "toggle_demo_mode") {
    const current = await getDemoModeStatus();
    const newValue = !current;
    await drizzleDb
      .insert(drizzleSchema.system_settings)
      .values({
        user_id: 0,
        key: "demo_mode_enabled",
        value: String(newValue),
      })
      .onConflictDoUpdate({
        target: [
          drizzleSchema.system_settings.user_id,
          drizzleSchema.system_settings.key,
        ],
        set: { value: String(newValue), updated_at: sql`CURRENT_TIMESTAMP` },
      });
    return c.json({ success: true, demoMode: newValue });
  }

  if (action === "reset_demo_session") {
    // 批量删除：先删 practice_logs，再删 practice_sessions（使用子查询避免 N+1）
    await drizzleDb.run(sql`
            DELETE FROM practice_logs WHERE session_id IN (SELECT id FROM practice_sessions WHERE is_demo = 1)
        `);
    await drizzleDb
      .delete(drizzleSchema.practice_sessions)
      .where(eq(sql`is_demo`, 1));
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `ai-learning-backup-${timestamp}.db`;
  const tempDir = path.resolve(process.cwd(), "temp_backups");
  const tempPath = path.resolve(tempDir, filename);

  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    await drizzleDb.run(sql`VACUUM INTO ${tempPath}`);
    await logAdminAction(
      user.id,
      user.username,
      "BACKUP_DATABASE",
      "system",
      "database",
      { filename },
    );
    const fileBuffer = fs.readFileSync(tempPath);
    fs.unlinkSync(tempPath);

    return c.body(fileBuffer, 200, {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/x-sqlite3",
    });
  } catch (_error) {
    if (fs.existsSync(tempPath))
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    return c.json({ error: "Backup failed" }, 500);
  }
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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

    const dbPath = path.resolve(process.cwd(), "data", "ai-learning.db");
    const backupPath = path.resolve(
      process.cwd(),
      "data",
      `ai-learning.db.bak-${Date.now()}`,
    );
    const tempPath = path.resolve(process.cwd(), "data", "temp_restore.db");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.subarray(0, 16).toString().startsWith("SQLite format 3")) {
      return c.json({ error: "无效的 SQLite 数据库文件" }, 400);
    }

    fs.writeFileSync(tempPath, buffer);
    closeDb();

    try {
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      fs.renameSync(tempPath, dbPath);
      reinitDb();
      await logAdminAction(
        user.id,
        user.username,
        "RESTORE_DATABASE",
        "system",
        "database",
        {
          filename: file.name,
          backupCreated: path.basename(backupPath),
        },
      );
      return c.json({
        success: true,
        backupCreated: path.basename(backupPath),
      });
    } catch (e: unknown) {
      try {
        if (fs.existsSync(backupPath) && !fs.existsSync(dbPath))
          fs.copyFileSync(backupPath, dbPath);
      } catch {}
      try {
        reinitDb();
      } catch {}
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return c.json(
        {
          error:
            "Restore failed: " +
            ((e instanceof Error ? e.message : null) || "Unknown error"),
        },
        500,
      );
    }
  } catch (error: unknown) {
    try {
      reinitDb();
    } catch {}
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const logs = await drizzleDb
    .select({
      id: drizzleSchema.admin_logs.id,
      action: drizzleSchema.admin_logs.action,
      username: drizzleSchema.admin_logs.username,
      details: drizzleSchema.admin_logs.details,
      created_at: drizzleSchema.admin_logs.created_at,
    })
    .from(drizzleSchema.admin_logs)
    .where(
      sql`${drizzleSchema.admin_logs.action} IN ('BACKUP_DATABASE', 'RESTORE_DATABASE')`,
    )
    .orderBy(desc(drizzleSchema.admin_logs.created_at))
    .limit(50);

  const history = logs.map((log) => {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(log.details || "{}");
    } catch {}
    return {
      id: log.id,
      action: log.action,
      username: log.username,
      filename: (details.filename as string) || null,
      backupCreated: (details.backupCreated as string) || null,
      created_at: log.created_at,
    };
  });

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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { search, tag, dimension } = c.req.valid("query");

  let query = drizzleDb.select().from(drizzleSchema.questions);
  const conditions = [];

  if (search)
    conditions.push(like(drizzleSchema.questions.content, `%${search}%`));
  if (tag)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})`,
    );
  if (dimension)
    conditions.push(
      eq(drizzleSchema.questions.dimension, dimension as Dimension),
    );

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as unknown as typeof query;
  }

  const questions = await query.orderBy(desc(drizzleSchema.questions.id)).all();

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
  let csvContent = "\uFEFF" + headers.map(escapeCsv).join(",") + "\n";

  for (const q of questions) {
    const row = [
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
    ];
    csvContent += row.map(escapeCsv).join(",") + "\n";
  }

  const fileName = `questions_export_${new Date().toISOString().split("T")[0]}.csv`;
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { sql: sqlContent, description } = await c.req.json();
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
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
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { SqlScriptService } =
    await import("@/lib/services/sql-script-service");
  const result = await SqlScriptService.cleanupOldBackups();

  return c.json(result, 200);
});
