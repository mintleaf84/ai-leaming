import { handle } from "hono/vercel";
import { app } from "@/lib/api/app";

export const runtime = "nodejs";

// Hono 应用的构造与全部路由挂载都在 src/lib/api/app.ts，
// 这里只做 Next.js Route Handler 适配。
// 抽出 app 的原因：契约快照脚本（scripts/dump-openapi.ts）需要在不起 HTTP 服务的
// 前提下拿到同一份 OpenAPI 文档；如果 app 只存在于 route.ts 内部，就只能靠
// 启动服务来取，本机（glibc 2.17，跑不了 next build/start）做不到。
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);
