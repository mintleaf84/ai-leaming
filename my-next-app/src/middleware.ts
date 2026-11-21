import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt, COOKIE_NAME } from "@/lib/auth/auth-edge";

// 1. Specify protected and public routes
const protectedRoutes = [
  "/practice",
  "/dashboard",
  "/chat",
  "/history",
  "/knowledge",
  "/settings",
  "/admin",
  // 题库导入与错题本都承载个人数据 / 需要登录态的动作，未登录必须拦截
  "/questions",
  "/wrong-book",
  // 回忆自测：队列与判分都按登录用户隔离
  "/recall",
  // 试卷/模考：试卷归属与作答记录都是个人数据
  "/exam",
  // AI 题集：外部 Agent 推给个人的批次，练习会话同样按登录用户隔离
  "/agent-sets",
  // 粉笔同步：绑定的账号与同步记录都是个人数据
  "/fenbi",
];
const publicRoutes = ["/login", "/register"];

// 慢请求阈值：超过就升到 warn 级（docs/performance.md T-03）。
const SLOW_REQUEST_MS = 300;

/**
 * 每个请求只产出一条结构化日志。
 *
 * 历史实现在鉴权分支里散落 3 条 console.log + 末尾一条 JSON，同一请求打 4 行，
 * 既难聚合也让日志量翻倍。这里统一收口：所有 return 点都走 `finish()`，
 * 保证「一请求一日志」，并把原本单独的鉴权失败信息并入 `authError` 字段。
 *
 * 注意：middleware 运行在 Edge runtime，不能引入 pino（src/lib/logger.ts）。
 */
function writeLog(entry: {
  level: "info" | "warn";
  requestId: string;
  method: string;
  path: string;
  status: number;
  startTime: number;
  userId: string;
  authError?: string;
  req: NextRequest;
}) {
  const duration = Date.now() - entry.startTime;
  console.log(
    JSON.stringify({
      level: entry.level,
      timestamp: new Date().toISOString(),
      requestId: entry.requestId,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      duration: `${duration}ms`,
      durationMs: duration,
      userId: entry.userId,
      ...(entry.authError ? { authError: entry.authError } : {}),
      ip:
        entry.req.headers.get("x-real-ip") ||
        entry.req.headers.get("x-forwarded-for") ||
        "unknown",
    }),
  );
}

export async function middleware(req: NextRequest) {
  // 0. Generate Request ID for tracing
  const requestId = crypto.randomUUID(); // Use native crypto, faster than nanoid for simple UUIDs
  const startTime = Date.now();

  // 2. Check if the current route is protected or public
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route),
  );
  const isPublicRoute = publicRoutes.includes(path);

  // 3. Decrypt the session from the cookie
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  let session = null;
  let userId = "anonymous";
  let authError: string | undefined;

  if (cookie) {
    try {
      session = (await decrypt(cookie)) as {
        user?: { id?: number; role?: string };
      } | null;
      userId = session?.user?.id ? String(session.user.id) : "anonymous";
    } catch (e: unknown) {
      // audit-allow: 解密失败即"未登录"，必须继续走下方 isProtectedRoute 的重定向判断，
      // 在此 return 会跳过鉴权分支（等于放行）。失败是低频路径，因此这里单独留一条
      // 告警（正常请求只有末尾那一条结构化日志），同时把原因挂到 authError 上。
      authError = (e as Error).message;
      console.warn(`[Middleware] token decrypt failed: ${authError}`);
    }
  }

  // 所有出口共用的收尾：写一条日志再返回。
  const finish = (response: NextResponse) => {
    const duration = Date.now() - startTime;
    writeLog({
      level: duration > SLOW_REQUEST_MS ? "warn" : "info",
      requestId,
      method: req.method,
      path,
      status: response.status,
      startTime,
      userId,
      authError,
      req,
    });
    return response;
  };

  // 4. Redirect to /login if the user is not authenticated
  if (isProtectedRoute && !session) {
    return finish(NextResponse.redirect(new URL("/login", req.nextUrl)));
  }

  // 4.1 Admin Route Protection (基于角色的权限控制)
  if (path.startsWith("/admin")) {
    // 使用角色字段判断权限，而非硬编码 ID
    if (!session?.user?.role || session.user.role !== "admin") {
      return finish(NextResponse.redirect(new URL("/dashboard", req.nextUrl)));
    }
  }

  // 5. Redirect to /dashboard if the user is authenticated and trying to access a public route
  // (Optional: usually helpful for login/register pages)
  if (
    isPublicRoute &&
    session &&
    !req.nextUrl.pathname.startsWith("/dashboard") &&
    path !== "/"
  ) {
    return finish(NextResponse.redirect(new URL("/dashboard", req.nextUrl)));
  }

  const response = NextResponse.next();

  // 6. Injection Tracing Headers
  response.headers.set("X-Request-Id", requestId);

  return finish(response);
}

// Routes Middleware should not run on
//
// 静态资源后缀在这里排除，避免每个字体/图标/SW 请求都做一次 jose 验签 + 一条日志。
// 只按「文件后缀」排除，不排除查询串 —— `?_rsc=` 的客户端导航请求正是要计时的对象
// （docs/performance.md T-03 的慢请求统计口径），且这些请求同样需要未登录重定向，
// 排除掉等于把受保护页面的客户端导航从鉴权链路上摘下来。
//
// `public/icons`、`public/fonts` 是 PWA 图标与字体目录（manifest 会一次拉十几个图标），
// 与任何页面路由都不重名，一并按目录排除，纯减少匹配面、不改行为。
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|map|txt|xml)$).*)",
  ],
};
