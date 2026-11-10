/**
 * 安装前的 Node 版本守卫。
 *
 * 为什么不用 `.npmrc` 的 `engine-strict`：很多依赖（如 unpdf）自己声明
 * `engines.node >= 22`，开启严格模式会让 `npm ci` 直接失败。这里只校验
 * **本项目**的运行时基线（.nvmrc），第三方声明交给各自容错。
 *
 * 校验方式：.nvmrc 视为**最低版本**，实际版本必须同主版本且不低于它。
 * （只比主版本会放过 20.18，而 engines 要求 >= 20.19.0。）
 */
const fs = require("node:fs");
const path = require("node:path");

const nvmrcPath = path.resolve(__dirname, "..", ".nvmrc");
let expected = null;
try {
  expected = fs.readFileSync(nvmrcPath, "utf8").trim();
} catch {
  // 没有 .nvmrc 时不阻塞安装（例如仅安装了 nvm 之外的运行时环境）
}

if (!expected) process.exit(0);

function parse(v) {
  return String(v)
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
}

function lessThan(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

const actual = parse(process.versions.node);
const want = parse(expected);

const sameMajor = actual[0] === want[0];
const tooOld = lessThan(actual, want);

if (!sameMajor || tooOld) {
  console.error(
    [
      "",
      `✖ Node 版本不符合本项目基线：当前 v${process.versions.node}，要求 v${expected}（见 .nvmrc）`,
      "",
      "  本仓库本机与 CI / Docker 必须一致，否则会出现「本机能跑、CI 挂」。",
      "  本机切换方式（免 root）：",
      `    micromamba create -y -n node${want[0]} nodejs=${want[0]}.${want[1] || 0}`,
      `    micromamba run -n node${want[0]} npm install`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}
