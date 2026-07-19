// 测试环境预设环境变量，确保 @t3-oss/env-nextjs 校验通过
// 必须在任何模块 import 之前设置，因为 env.ts 在模块加载时就会执行校验
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.AI_API_KEY = process.env.AI_API_KEY || "test-api-key";
process.env.AI_API_URL = process.env.AI_API_URL || "https://api.openai.com/v1";
process.env.DB_FILENAME = process.env.DB_FILENAME || "ai-learning.db";

import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 每次测试后清理组件
afterEach(() => {
  cleanup();
});

// Mock scrollIntoView 因为 jsdom 不支持
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
  // Radix UI 需要 pointer event API，jsdom 不支持
  Element.prototype.hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
}
