import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  isServer: typeof window === "undefined" || !!process.env.VITEST,
  server: {
    JWT_SECRET: z.string().min(1, "JWT_SECRET 不能为空"),
    DB_FILENAME: z.string().default("ai-learning.db"),
    AI_API_KEY: z.string().min(1, "AI_API_KEY 不能为空"),
    AI_API_URL: z.string().url().default("https://api.openai.com/v1"),
    BACKUP_ENCRYPTION_KEY: z.string().optional(),
    PADDLE_OCR_TOKEN: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    E2E_TEST: z.string().default("false"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
})
