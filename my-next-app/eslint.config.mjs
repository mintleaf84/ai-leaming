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
    files: ["tests/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off"
    }
  }
]);

export default eslintConfig;
