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
    // 性能禁止清单（docs/performance.md T-10）：把 docs/ui-system.md §7 的
    // 禁止项从"靠 review 记得"变成可见告警。先 warn + 棘轮吸收存量，
    // 清到 0 再升 error —— 与 no-unused-vars 当初的收敛方式一致。
    //
    // 为什么用 no-restricted-syntax 而不是自定义插件：规则要能在 CI 里跑、
    // 不需要维护插件包，且选择器可读。
    //
    // 已知覆盖不到的写法（故意不强行匹配，避免误伤）：
    //   * className 来自变量 / cn() 拼接 —— 选择器只看字符串字面量；
    //   * `overflow-x-auto` 包整页 —— 全仓仅代码块（MarkdownViewer/CodeBlock）
    //     两处合法用法，一刀切会立刻假红，留给 review。
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            'JSXAttribute[name.name="className"][value.value=/\\btransition-all\\b/]',
          message:
            "禁止 transition-all：它会为所有可动画属性建过渡，配合 backdrop-blur/shadow 会逐帧重绘。改用 transition-colors / transition-shadow / transition-transform。",
        },
        {
          selector:
            'JSXAttribute[name.name="className"][value.value=/backdrop-blur/][value.value=/\\b(fixed|sticky)\\b/]',
          message:
            "固定/吸顶容器禁止 backdrop-blur：它压在滚动容器上时每帧都要重新采样背景（MobileNav 就是这么亏的）。用接近不透明的纯色底代替。",
        },
        {
          selector:
            'JSXAttribute[name.name="className"][value.value=/\\b(xl|2xl):/]',
          message:
            "只用 sm/md/lg 三档断点（docs/ui-system.md §2）。xl/2xl 会让布局在 1024–1440 之间失去断言覆盖。",
        },
        {
          selector: 'CallExpression[callee.name="useMediaQuery"]',
          message:
            "禁止用 JS 判宽决定布局：两段 DOM 都渲染，显隐交给 CSS（md: 前缀）。例外只有滚动条补偿与 PWA display-mode，写在注释里并加 eslint-disable-next-line + 理由。",
        },
        {
          selector: 'MemberExpression[object.name="window"][property.name="innerWidth"]',
          message:
            "禁止读 window.innerWidth 做布局判断（同 useMediaQuery）。确实需要像素值的地方（图表 canvas、虚拟列表高度）请走 useSyncExternalStore 并在注释里说明。",
        },
      ],
    },
  },
  {
    // 基础 UI 组件不做动效（docs/performance.md T-10）：
    // ui/button.tsx 曾把 Button 做成 motion.button，302 个调用点各挂一套
    // framer 实例与 pointer 监听。基础组件只用 CSS 过渡。
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "framer-motion",
              message:
                "components/ui/* 是原子组件，不引入 framer-motion（运行时体积 + 每个实例的监听）。动效放业务组件，基础组件的按压态用 CSS :active。",
            },
          ],
        },
      ],
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
