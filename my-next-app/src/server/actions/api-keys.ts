"use server";

import { adminAction } from "@/lib/safe-action";
import { drizzleDb } from "@/lib/db";
import { api_keys } from "@/lib/db/drizzle-schema";
import { eq, desc, sql } from "drizzle-orm";
import { logAdminAction } from "@/lib/admin/audit";
import { after } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import type { ApiKeyView } from "@/types/api-key";

/**
 * 获取所有 API Key 列表
 */
export const getApiKeysAction = adminAction.action(async () => {
  const rows = await drizzleDb
    .select()
    .from(api_keys)
    .orderBy(desc(api_keys.created_at));
  return rows as ApiKeyView[];
});

/**
 * 生成新的 API Key
 */
export const createApiKeyAction = adminAction
  .inputSchema(
    z.object({
      description: z.string().default("未命名密钥"),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const { description } = input;
    const { user } = ctx;

    // 生成 32 字节的随机密钥（以 hex 编码，共 64 字符）
    const keyString = `sk_${crypto.randomBytes(24).toString("hex")}`;

    await drizzleDb.insert(api_keys).values({
      key_string: keyString,
      description: description,
    });

    after(() =>
      logAdminAction(
        user.id,
        user.username,
        "CREATE_API_KEY",
        "api_key",
        null,
        { description },
      ),
    );

    return { success: true, key: keyString };
  });

/**
 * 切换 API Key 的激活状态
 */
export const toggleApiKeyAction = adminAction
  .inputSchema(
    z.object({
      id: z.number(),
      isActive: z.boolean(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const { id, isActive } = input;
    const { user } = ctx;

    await drizzleDb
      .update(api_keys)
      .set({
        is_active: isActive ? 1 : 0,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(api_keys.id, id));

    after(() =>
      logAdminAction(
        user.id,
        user.username,
        "TOGGLE_API_KEY",
        "api_key",
        id.toString(),
        {
          is_active: isActive,
        },
      ),
    );

    return { success: true };
  });

/**
 * 删除 API Key
 */
export const deleteApiKeyAction = adminAction
  .inputSchema(z.number())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await drizzleDb.delete(api_keys).where(eq(api_keys.id, id));

    after(() =>
      logAdminAction(
        user.id,
        user.username,
        "DELETE_API_KEY",
        "api_key",
        id.toString(),
      ),
    );

    return { success: true };
  });
