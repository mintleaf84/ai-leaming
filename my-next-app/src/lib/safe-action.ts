import { createSafeActionClient } from "next-safe-action";
import { requireUser, requireRole } from "@/lib/auth/auth";

/**
 * 基础 Action（无需鉴权）
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    console.error("Action error:", e.message);
    return e.message;
  },
});

/**
 * 已登录用户 Action
 */
export const authenticatedAction = actionClient.use(async ({ next }) => {
  const user = await requireUser();
  return next({ ctx: { user } });
});

/**
 * 管理员 Action
 */
export const adminAction = actionClient.use(async ({ next }) => {
  const user = await requireRole(['admin']);
  return next({ ctx: { user } });
});
