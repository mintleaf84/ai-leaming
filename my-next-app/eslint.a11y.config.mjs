/**
 * 无障碍（a11y）静态检查**专用**配置 —— 只给 `scripts/audit-a11y.cjs` 用。
 *
 * 为什么不复用 eslint.config.mjs：
 *   eslint.config.mjs 是 `lint:ci` 的门禁配置，`.eslint-baseline.json` 的 89 条
 *   warning 是按它的规则集算出来的。往里塞 jsx-a11y 会让 31 条 error 级规则
 *   直接把 `lint:ci` 打红，等于把「a11y 存量审计」和「增量门禁」两件事绑死。
 *   审计轮不改存量代码，所以审计必须有自己的规则集与自己的基线文件。
 *
 * 只启用 `flatConfigs.recommended` 的 rules（34 条，其中 3 条官方自己标 off），
 * 不调 severity、不加 off、不加 ignore —— 数字多大都如实统计。
 */
import tsParser from "@typescript-eslint/parser";
import jsxA11y from "eslint-plugin-jsx-a11y";

const recommendedRules = jsxA11y.flatConfigs?.recommended?.rules ?? {};
if (Object.keys(recommendedRules).length === 0) {
  throw new Error(
    "eslint-plugin-jsx-a11y 未导出 flatConfigs.recommended.rules，审计配置无法建立",
  );
}

const a11yAuditConfig = [
  {
    name: "a11y-audit/src-tsx",
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "jsx-a11y": jsxA11y },
    // 组件名 → 原生元素映射。
    // 没有它，`jsx-a11y/alt-text` 只认原生 <img>/<object>/<area>/<input type="image">，
    // 而本仓图片基本走 next/image 的 <Image>（6 处，分布在 AppSidebar/Navbar/
    // app/page.tsx/register/login/textbooks）—— 结果是 alt-text 恒为 0，
    // 看着"清白"其实根本没被检查。属于"配好了但看不见"的静默漏检。
    // 已确认全仓没有从 lucide-react 等处导入名为 Image 的组件，映射不会误伤。
    settings: {
      "jsx-a11y": {
        components: {
          Image: "img",
        },
      },
    },
    rules: recommendedRules,
  },
];

// 具名导出：本文件也会被仓库主配置 `eslint .` 扫到，
// `export default [...]` 会触发 import/no-anonymous-default-export（+1 warning 打红 lint:ci）。
export default a11yAuditConfig;
