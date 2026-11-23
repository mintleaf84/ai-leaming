#!/usr/bin/env node
/**
 * Flutter 解析器 ↔ OpenAPI 枚举的一致性检查（`npm run contract:mobile`）。
 *
 * 为什么需要它：Web 侧的取值集合写在路由文件里的 `z.enum`，
 * Flutter 侧在 `mobile_app` 各 feature 的 domain 目录下另写一份 `parse`。
 * 两边没有任何联动检查——#312 那次给 `/qrcode/status` 加了 `canceled` / `failed`，
 * 全靠人工想起来去同步 App 的 `FenbiQrPhase`，否则 App 会停在「正在确认扫码状态…」。
 * 这个脚本把「想起来」变成红灯。
 *
 * 两种模式：
 *   node scripts/check-mobile-contract.cjs --report   列出契约里的全部枚举，供人工归类
 *   node scripts/check-mobile-contract.cjs            按 contract-mobile-map.json 校验（CI 用）
 *
 * 映射表是**人工评审过的契约面**，三种取值：
 *   subset  —— App 声称完整处理该字段：每个契约取值都必须出现在对应 Dart 文件里
 *   partial —— App 只关心列出的那几个（典型：用两个布尔标志代替枚举），只校验列出的
 *   unused  —— App 不消费该字段：反过来要求 Dart 里一个都不出现，
 *              一旦有人加了一半处理，CI 会要求把它改成 subset/partial 并写清楚
 *
 * 防「静默变绿」：扫不到任何枚举、映射为空、或映射指向的契约项消失，都算失败。
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const OPENAPI_FILE = path.join(REPO, "docs", "openapi.json");
const MAP_FILE = path.join(__dirname, "contract-mobile-map.json");
const REPORT = process.argv.includes("--report");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** 快照里 99% 的 schema 是内联的，仍有少量 $ref，做个够用解析 */
function deref(doc, node) {
  let cur = node;
  const guard = new Set();
  while (cur && typeof cur === "object" && typeof cur.$ref === "string") {
    if (guard.has(cur.$ref)) return {};
    guard.add(cur.$ref);
    const parts = cur.$ref.replace(/^#\//, "").split("/");
    cur = parts.reduce((acc, key) => (acc ? acc[key] : undefined), doc);
  }
  return cur || {};
}

/**
 * 递归收集带 enum 的叶子。
 * out 的 key：`GET /api/x :: res.200 :: status` / `:: body :: type` / `:: query.mode :: mode`
 */
function collectEnums(doc) {
  const found = new Map();

  const walk = (schema, location, chain, depth, seenRefs) => {
    if (!schema || typeof schema !== "object" || depth > 12) return;
    if (Array.isArray(schema.anyOf)) {
      for (const sub of schema.anyOf) walk(sub, location, chain, depth + 1, seenRefs);
      return;
    }
    if (Array.isArray(schema.oneOf)) {
      for (const sub of schema.oneOf) walk(sub, location, chain, depth + 1, seenRefs);
      return;
    }
    if (Array.isArray(schema.allOf)) {
      for (const sub of schema.allOf) walk(sub, location, chain, depth + 1, seenRefs);
      return;
    }
    if (schema.type === "array" && schema.items) {
      walk(deref(doc, schema.items), location, chain, depth + 1, seenRefs);
      return;
    }
    if (Array.isArray(schema.enum) && chain.length > 0) {
      const values = schema.enum.filter((v) => typeof v === "string");
      if (values.length === 0) return;
      const key = `${location} :: ${chain[chain.length - 1]}`;
      const prev = found.get(key);
      found.set(key, {
        location,
        values: prev ? Array.from(new Set([...prev.values, ...values])) : values,
        chain: chain.join("."),
      });
      return;
    }
    const props = schema.properties || schema.additionalProperties;
    if (props && typeof props === "object") {
      for (const [name, sub] of Object.entries(props)) {
        const resolved = deref(doc, sub);
        const refKey = typeof sub?.$ref === "string" ? sub.$ref : null;
        if (refKey) {
          if (seenRefs.has(`${location}|${refKey}`)) continue;
          walk(resolved, location, [...chain, name], depth + 1, new Set(seenRefs).add(`${location}|${refKey}`));
        } else {
          walk(resolved, location, [...chain, name], depth + 1, seenRefs);
        }
      }
    }
  };

  for (const [apiPath, item] of Object.entries(doc.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const base = `${method.toUpperCase()} ${apiPath}`;

      for (const [status, resp] of Object.entries(op.responses || {})) {
        const schema = resp?.content?.["application/json"]?.schema;
        if (schema) walk(deref(doc, schema), `${base} :: res.${status}`, [], 0, new Set());
      }

      const reqSchema = op.requestBody?.content?.["application/json"]?.schema;
      if (reqSchema) walk(deref(doc, reqSchema), `${base} :: body`, [], 0, new Set());

      for (const param of op.parameters || []) {
        if (param?.schema?.enum) {
          walk(param.schema, `${base} :: query.${param.name}`, [], 0, new Set());
        }
      }
    }
  }
  return found;
}

/** Dart 里「显式处理了某个字符串」的写法 */
function dartHandledTokens(absFile) {
  const src = fs.readFileSync(absFile, "utf8");
  const tokens = new Set();
  const patterns = [
    /\bcase\s+'([^']+)'\s*:/g, // switch 语句
    /'([^']+)'\s*=>/g, // switch 表达式
    /==\s*'([^']+)'/g, // 直接比较（status == 'promoted'；注意 [=!]== 其实要求三个字符）
    /\bcase\s+"([^"]+)"\s*:/g,
    /"([^"]+)"\s*=>/g,
    /==\s*"([^"]+)"/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) tokens.add(m[1]);
  }
  // enum 成员名：RecallVerdict { ok, miss } 里的 miss 不会以字符串出现，但确实被处理了。
  // 注意两点：Dart 的枚举成员之间常夹 /// 注释（先去注释，否则成员名被注释吞掉）；
  // 成员常带构造参数 single('single', '单选')，括号里的 wire 值本身也是有效 token。
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const skip = new Set(["static", "const", "final", "var", "get", "set", "return", "factory", "true", "false"]);
  for (const m of noComments.matchAll(/\benum\s+\w+\s*\{([\s\S]*?)\}/g)) {
    const memberList = m[1].split(";")[0]; // 分号之后是方法，不是成员
    // 成员名（fillBlank）与构造参数里的 wire 值（'fill_blank'）都算被处理过：
    // fromWire 是按 wire 比对的，只看成员名会把 fill_blank 判成没处理。
    for (const raw of memberList.matchAll(/([A-Za-z_]\w*)|'([^']*)'|\"([^\"]*)\"/g)) {
      const name = raw[1] ?? raw[2] ?? raw[3];
      if (name && !skip.has(name)) tokens.add(name);
    }
  }
  return tokens;
}

/**
 * 只在指定区域（通常是某个 parse / fromWire 函数体）内取字符串。
 *
 * 为什么需要：整文件的 token 集合会把枚举成员名也算进来，于是
 * 「枚举里有 canceled，但 parse 的 switch 漏了这条分支」依然是绿的——
 * 而那恰好就是我们要抓的错。指定区域后，「有没有分支」必须显式存在。
 */
function regionTokens(absFile, regionPatterns) {
  const src = fs.readFileSync(absFile, "utf8");
  let text = "";
  for (const source of regionPatterns) {
    for (const m of src.matchAll(new RegExp(source, "g"))) text += `\n${m[0]}`;
  }
  const tokens = new Set();
  for (const re of [
    /\bcase\s+'([^']+)'\s*:/g,
    /'([^']+)'\s*=>/g,
    /==\s*'([^']+)'/g,
  ]) {
    for (const m of text.matchAll(re)) tokens.add(m[1]);
  }
  return tokens;
}

function main() {
  const doc = readJson(OPENAPI_FILE);
  const found = collectEnums(doc);

  if (REPORT) {
    console.log(`契约枚举共 ${found.size} 处（用于归类，不判定通过与否）\n`);
    for (const [key, info] of [...found.entries()].sort()) {
      console.log(`${key}\n    ${info.values.join(", ")}`);
    }
    return;
  }

  if (found.size === 0) {
    console.error(
      "✗ 一个契约枚举都没扫到。多半是 docs/openapi.json 的结构变了，检查器已失效——修检查器，别删它。",
    );
    process.exit(1);
  }

  const map = readJson(MAP_FILE);
  const entries = Array.isArray(map.entries) ? map.entries : [];
  if (entries.length === 0) {
    console.error("✗ contract-mobile-map.json 是空的，检查等于没跑。");
    process.exit(1);
  }

  const errors = [];
  const notices = [];
  let subsetCount = 0;
  let partialCount = 0;
  let unusedCount = 0;

  for (const entry of entries) {
    const info = found.get(entry.endpoint);
    if (!info) {
      errors.push(
        `映射指向的契约项已不存在：${entry.endpoint}\n    契约改了就先改映射（--report 可列出当前全部枚举）`,
      );
      continue;
    }
    const abs = path.join(REPO, entry.dart);
    if (!fs.existsSync(abs)) {
      errors.push(`Dart 文件不存在：${entry.dart}\n    对应契约项：${entry.endpoint}`);
      continue;
    }
    const tokens = entry.parseIn
      ? regionTokens(abs, entry.parseIn)
      : dartHandledTokens(abs);

    if (entry.mode === "subset") {
      subsetCount += 1;
      // knownGap：已确认但本轮没修的缺口。列出来就降级成提示（每次 CI 都会打印），
      // 既不把闸门永久堵死，也不让它从视野里消失。修好后删掉该字段即可变回硬失败。
      const gap = entry.knownGap || [];
      const missing = info.values.filter((v) => !tokens.has(v) && !gap.includes(v));
      const stillGap = info.values.filter((v) => !tokens.has(v) && gap.includes(v));
      if (stillGap.length > 0) {
        notices.push(
          `已知未修的缺口 ${entry.endpoint} → ${stillGap.join(", ")}：${entry.gapReason || "未说明"}`,
        );
      }
      if (missing.length > 0) {
        errors.push(
          `${entry.endpoint}\n    契约新增/变更的取值 ${entry.dart} 没有处理：${missing.join(", ")}\n    ${entry.note || "补 parse 分支，别让它落进默认分支"}`,
        );
      }
    } else if (entry.mode === "partial") {
      partialCount += 1;
      const wanted = entry.consume || [];
      if (wanted.length === 0) {
        errors.push(`partial 必须写明 consume 列表：${entry.endpoint}`);
        continue;
      }
      const missing = wanted.filter((v) => !tokens.has(v));
      if (missing.length > 0) {
        errors.push(
          `${entry.endpoint}\n    App 声称只处理 ${wanted.join("/")}，但这些没处理：${missing.join(", ")}`,
        );
      }
      const ignored = info.values.filter((v) => !wanted.includes(v));
      if (ignored.length > 0) {
        notices.push(
          `${entry.endpoint} 有意忽略：${ignored.join(", ")}（${entry.note || "未说明理由"}）`,
        );
      }
    } else if (entry.mode === "unused") {
      unusedCount += 1;
      const touched = info.values.filter((v) => tokens.has(v));
      if (touched.length > 0) {
        errors.push(
          `${entry.endpoint}\n    映射说 App 不消费该字段，但 ${entry.dart} 已出现：${touched.join(", ")}\n    改成 partial/subset 并写清处理范围，别让一半的处理藏在默认分支里`,
        );
      }
    } else {
      errors.push(`未知 mode「${entry.mode}」：${entry.endpoint}`);
    }
  }

  // 明确「不检查」的项也要打印：知识要留下，否则下一个人只能重新查一遍。
  for (const skipEntry of map.notChecked || []) {
    notices.push(`不检查 ${skipEntry.endpoint}：${skipEntry.reason}`);
  }

  if (notices.length > 0) {
    console.log("ℹ 有意忽略的取值（不判失败）：");
    for (const n of notices) console.log(`  - ${n}`);
  }

  if (errors.length > 0) {
    console.error(
      `\n✗ Flutter 与 OpenAPI 的取值不一致，${errors.length} 项：\n`,
    );
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`));
    console.error(
      "背景见 docs/fenbi-sync-design.md §2.2 与本脚本头部注释；契约改了要先改 docs/ 与映射表。",
    );
    process.exit(1);
  }

  console.log(
    `✔ Flutter 解析器与 OpenAPI 枚举一致：映射 ${entries.length} 项（subset ${subsetCount} / partial ${partialCount} / unused ${unusedCount}），契约枚举 ${found.size} 处`,
  );
}

main();
