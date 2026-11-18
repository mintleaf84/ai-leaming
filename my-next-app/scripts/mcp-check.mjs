#!/usr/bin/env node
/**
 * MCP 工具表 ↔ OpenAPI 快照的一致性校验。
 *
 * 为什么需要：`mcp-server/tools.json` 是 agent 看到的"世界"，`docs/openapi.json`
 * 是服务端实际提供的"世界"。两者一旦漂移，agent 会在运行时才收到 404/400，
 * 而且报错看起来像"数据不存在"，很难追到"工具表写错了路径"。
 *
 * 检查三件事：
 *   1. 每条工具的 (method, path) 在快照里存在；
 *   2. 每个参数在快照的对应位置有声明（path/query → parameters，body → requestBody 的属性）；
 *   3. 参数方向与快照一致（path 参数必须在快照里是 in:path）。
 *
 * 用法：node scripts/mcp-check.mjs [--verbose]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const toolsPath = join(repoRoot, "mcp-server", "tools.json");
const openapiPath = join(repoRoot, "docs", "openapi.json");

const verbose = process.argv.includes("--verbose");

const { tools } = JSON.parse(readFileSync(toolsPath, "utf8"));
const spec = JSON.parse(readFileSync(openapiPath, "utf8"));

const problems = [];
const notes = [];

/** 解析 `$ref`（zod-openapi 会给具名 body schema 生成引用），只支持本地 components.schemas */
function resolveSchema(schema, depth = 0) {
  if (!schema || depth > 5) return schema ?? {};
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  const name = ref.split("/").pop();
  const target = spec.components?.schemas?.[name];
  return target ? resolveSchema(target, depth + 1) : schema;
}

function operationFor(tool) {
  // 工具表用外部路径（/questions），快照的 key 带 /api/external 前缀
  const fullPath = `/api/external${tool.path}`;
  const item = spec.paths?.[fullPath];
  if (!item) {
    problems.push(
      `${tool.name}: 快照里没有路径 ${fullPath}（工具表写错，或接口被改名/删除）`,
    );
    return null;
  }
  const operation = item[tool.method.toLowerCase()];
  if (!operation) {
    const available = Object.keys(item).join("/");
    problems.push(
      `${tool.name}: ${fullPath} 没有 ${tool.method}（快照里只有 ${available}）`,
    );
    return null;
  }
  return operation;
}

for (const tool of tools) {
  const operation = operationFor(tool);
  if (!operation) continue;

  const params = operation.parameters ?? [];
  const bodySchema = resolveSchema(
    operation.requestBody?.content?.["application/json"]?.schema,
  );
  const bodyProps = bodySchema?.properties ?? {};
  const requiredBody = new Set(bodySchema?.required ?? []);

  if (verbose) {
    notes.push(
      `${tool.name}: ${tool.method} ${tool.path} — path 参数 ${params.filter((p) => p.in === "path").map((p) => p.name).join(",") || "无"}；` +
        `query ${params.filter((p) => p.in === "query").map((p) => p.name).join(",") || "无"}；` +
        `body ${Object.keys(bodyProps).join(",") || "无"}`,
    );
  }

  // 1) 快照里声明的 path 参数，工具表必须都给
  for (const declared of params.filter((p) => p.in === "path")) {
    if (!tool.params.some((p) => p.name === declared.name && p.in === "path")) {
      problems.push(
        `${tool.name}: 快照要求 path 参数 {${declared.name}}，但工具表没声明`,
      );
    }
  }

  for (const param of tool.params) {
    if (param.in === "path") {
      const declared = params.find((p) => p.name === param.name && p.in === "path");
      if (!declared) {
        problems.push(
          `${tool.name}.${param.name}: 工具表当成 path 参数，但快照里没有这个 path 参数`,
        );
      }
      continue;
    }

    if (param.in === "query") {
      const declared = params.find((p) => p.name === param.name && p.in === "query");
      if (!declared) {
        problems.push(`${tool.name}.${param.name}: 快照里没有这个 query 参数`);
        continue;
      }
      // dryRun 在快照里是 enum("true"|"false")，工具表用 boolean：允许，但要能转换
      const schemaType = declared.schema?.type;
      if (param.type === "boolean" && schemaType !== "boolean" && schemaType !== "string") {
        problems.push(
          `${tool.name}.${param.name}: 工具表声明 boolean，快照是 ${schemaType ?? "未知"}`,
        );
      }
      continue;
    }

    // body
    const prop = bodyProps[param.name];
    if (!prop) {
      problems.push(`${tool.name}.${param.name}: 快照的 requestBody 里没有这个字段`);
      continue;
    }
    if (param.required && !requiredBody.has(param.name)) {
      problems.push(
        `${tool.name}.${param.name}: 工具表标成必填，快照里不是必填（required 数组里没有它）`,
      );
    }
  }

  // 2) 快照里必填的 body 字段，工具表不能漏
  for (const required of requiredBody) {
    if (!tool.params.some((p) => p.name === required && p.in === "body")) {
      problems.push(`${tool.name}: 快照要求 body.${required} 必填，但工具表没声明这个字段`);
    }
  }
}

if (verbose && notes.length > 0) {
  console.log("工具表 ↔ 快照对照：");
  for (const line of notes) console.log(`  - ${line}`);
}

if (problems.length > 0) {
  console.error(`✖ MCP 工具表与 OpenAPI 快照不一致（${problems.length} 处）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\n修法：改 mcp-server/tools.json 对齐 docs/openapi.json；若是接口本身改了，" +
      "先更新路由并重新生成快照（npx tsx scripts/dump-openapi.ts）。",
  );
  process.exit(1);
}

console.log(
  `✔ MCP 工具表与 OpenAPI 快照一致：${tools.length} 个工具，${spec.paths ? Object.keys(spec.paths).length : 0} 条路径。`,
);
