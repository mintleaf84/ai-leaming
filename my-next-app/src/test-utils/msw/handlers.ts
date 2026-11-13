/**
 * MSW HTTP 拦截处理器配置
 *
 * 本文件定义了测试环境中所有 HTTP API 请求的模拟响应。
 * 遵循 MSW 2.x 规范：使用 http.get / http.post 等方法。
 *
 * 架构说明：
 *  - 这里的 handlers 是"默认成功"的基准处理器。
 *  - 在单个测试中，使用 server.use(...) 覆盖特定场景（如错误响应）。
 */

import { http, HttpResponse } from "msw";

// ============================================================
// 认证 API Handlers
// ============================================================

/** 模拟登录接口：返回成功响应 */
const loginHandler = http.post("/api/auth/login", async ({ request }) => {
  const body = (await request.json()) as { username: string; password: string };

  // 测试用凭证：admin / password123 → 成功
  if (body.username === "admin" && body.password === "password123") {
    return HttpResponse.json({
      message: "登录成功",
      user: { id: 1, username: "admin", role: "admin" },
    });
  }

  // 其他凭证 → 401 未授权
  return HttpResponse.json({ error: "用户名或密码错误" }, { status: 401 });
});

/** 模拟登出接口：始终返回成功 */
const logoutHandler = http.post("/api/auth/logout", () => {
  return HttpResponse.json({ message: "已成功退出登录" });
});

// ============================================================
// 题库管理 API Handlers
// ============================================================

/** 模拟题目导出接口（CSV） */
const exportQuestionsHandler = http.get(
  "/api/admin/export/questions",
  ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";

    // 返回简单 CSV 内容
    const csvContent = [
      "id,content,answer,dimension",
      `1,"测试题目 ${search}","A","knowledge"`,
      '2,"另一道测试题","B","understanding"',
    ].join("\n");

    return new HttpResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="questions.csv"',
      },
    });
  },
);

// ============================================================
// 系统管理 API Handlers
// ============================================================

/** 模拟系统信息接口 */
const systemInfoHandler = http.get("/api/admin/system", () => {
  return HttpResponse.json({
    version: "1.0.0",
    dbSize: "2.5MB",
    questionCount: 1200,
    userCount: 50,
    uptime: "3 days",
  });
});

/** 模拟备份接口 */
const backupHandler = http.get("/api/admin/backup", () => {
  return HttpResponse.json({
    success: true,
    filename: "backup-2024-01-01.db",
    size: "2.5MB",
  });
});

// ============================================================
// 知识卡片 API Handlers
// ============================================================

/** 模拟知识卡片列表接口 */
const knowledgeCardsHandler = http.get("/api/knowledge/cards", () => {
  return HttpResponse.json([
    {
      id: 1,
      title: "记忆的三个阶段",
      content: "编码、存储、提取",
      tags: ["记忆", "认知"],
    },
    {
      id: 2,
      title: "巴甫洛夫条件反射",
      content: "条件刺激与无条件刺激的联结",
      tags: ["学习", "行为"],
    },
  ]);
});

// ============================================================
// 导出所有默认处理器
// ============================================================

export const handlers = [
  loginHandler,
  logoutHandler,
  exportQuestionsHandler,
  systemInfoHandler,
  backupHandler,
  knowledgeCardsHandler,
];
