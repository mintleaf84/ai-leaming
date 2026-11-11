import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
// 注意：不引入 eslint-config-next/typescript，它会触发全项目类型检查导致卡死
// 改为手动引入插件，只使用语法层面的规则（不需要 parserOptions.project）

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",   // E2E 测试编译产物，勿扫描
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 忽略辅助脚本目录及文件
    "scripts/**",
    "eslint_cleanup.js",
    "eslint_cleanup.py",
    "scratch/**",
    "scratch-db.test.ts",
    "coverage/**",
  ]),
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-require-imports": "warn"
    }
  },
  {
    // 服务端代码禁止裸 console：统一走 src/lib/logger.ts（pino 结构化日志）。
    // 客户端组件（"use client"）与测试/脚本不受此限。
    files: [
      "src/lib/**/*.ts",
      "src/server/**/*.ts",
      "src/app/**/*.ts",
      // 已确认是服务端执行的 .tsx（无 "use client"）
      "src/app/page.tsx",
      "src/app/layout.tsx",
      "src/instrumentation.ts",
    ],
    ignores: [
      "src/lib/logger.ts",
      "**/__tests__/**",
      "**/*.test.ts",
      // 以下模块会被客户端组件 / Edge middleware 引用，不能引入 pino
      "src/middleware.ts",
      "src/lib/utils/retry.ts",
      "src/lib/ai/rag.ts",
      "src/lib/services/srs.ts",
      "src/lib/services/knowledge.ts",
      "src/lib/services/question-folder.ts",
      // src/app 下的 hooks / components 是客户端代码，console 合法
      "src/app/**/hooks/**",
      "src/app/**/components/**",
    ],
    rules: {
      "no-console": "warn",
    },
  },
  {
    // 测试与 mock 里 `as any` 是合理手段（构造非法输入、模拟未类型化的 SQL 行、
    // 替换第三方类型），生产代码仍按 warn + 棘轮约束。
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**",
      "**/__mocks__/**",
      "tests/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off"
    }
  }
]);

export default eslintConfig;
