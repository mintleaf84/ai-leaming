import type { z } from "zod";
import {
  RECALL_SCHEMA_VERSION,
  recallDeckSchema,
  type RecallDeckFile,
} from "./types";

/**
 * 卡组文件的校验入口。
 *
 * 三条硬要求（都不是"体验优化"，而是排障必需）：
 * 1. **一次报全部错误**：用户改完一处又要重导一次才能看到下一处，卡组有 180 张卡
 *    时这基本等于不可用；
 * 2. 每条错误必须能**定位到具体卡片**：带 `cards[i]` 与 `cardId`，再带字段路径；
 * 3. 未知 `schema` 版本**直接拒绝**，不做兼容猜测（猜测会静默写坏数据）。
 */
export class RecallDeckValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `卡组文件校验失败（${issues.length} 处）：\n- ${issues.join("\n- ")}`,
    );
    this.name = "RecallDeckValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 把 zod issue 渲染成「cards[3] (cardId=L1-c07) → blanks[0].answers: …」 */
function renderPath(segments: string[]): string {
  let rendered = "";
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      rendered += `[${segment}]`;
      continue;
    }
    rendered += rendered === "" ? segment : `.${segment}`;
  }
  return rendered;
}

function formatIssue(issue: z.core.$ZodIssue, raw: unknown): string {
  const path = issue.path.map((segment) => String(segment));
  let location = "deck";
  let rest = path;

  if (path[0] === "cards" && path[1] !== undefined) {
    const index = Number(path[1]);
    const rawCard =
      isRecord(raw) && Array.isArray(raw.cards) ? raw.cards[index] : undefined;
    const cardId = isRecord(rawCard)
      ? String(rawCard.cardId ?? "<缺失 cardId>")
      : "<缺失卡片>";
    location = `cards[${index}] (cardId=${cardId})`;
    rest = path.slice(2);
  } else if (path[0] === "groups" && path[1] !== undefined) {
    const index = Number(path[1]);
    const rawGroup =
      isRecord(raw) && Array.isArray(raw.groups)
        ? raw.groups[index]
        : undefined;
    const groupId = isRecord(rawGroup)
      ? String(rawGroup.groupId ?? "<缺失 groupId>")
      : "<缺失分组>";
    location = `groups[${index}] (groupId=${groupId})`;
    rest = path.slice(2);
  }

  const field = rest.length > 0 ? ` → ${renderPath(rest)}` : "";
  return `${location}${field}: ${issue.message}`;
}

/**
 * 解析并校验卡组文件。接受**已解析的对象**或 JSON 字符串。
 *
 * @throws {RecallDeckValidationError} 任何形状/版本/业务约束问题（一次报全）
 */
export function parseRecallDeck(input: unknown): RecallDeckFile {
  let raw: unknown = input;

  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new RecallDeckValidationError([
        `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`,
      ]);
    }
  }

  if (!isRecord(raw)) {
    throw new RecallDeckValidationError([
      `卡组文件顶层必须是对象，收到 ${Array.isArray(raw) ? "数组" : typeof raw}`,
    ]);
  }

  // 版本闸门放在 zod 之前：zod 的 literal 报错是 "Invalid input"，
  // 对用户/内容侧脚本来说等于没说清楚到底该改成什么。
  if (!("schema" in raw)) {
    throw new RecallDeckValidationError([
      `缺少 schema 字段（当前只支持 schema=${RECALL_SCHEMA_VERSION}）`,
    ]);
  }
  if (raw.schema !== RECALL_SCHEMA_VERSION) {
    throw new RecallDeckValidationError([
      `不支持的卡组版本 schema=${String(raw.schema)}，当前只接受 schema=${RECALL_SCHEMA_VERSION}（不做向下兼容猜测）`,
    ]);
  }

  const result = recallDeckSchema.safeParse(raw);
  if (!result.success) {
    throw new RecallDeckValidationError(
      result.error.issues.map((issue) => formatIssue(issue, raw)),
    );
  }

  return result.data;
}
