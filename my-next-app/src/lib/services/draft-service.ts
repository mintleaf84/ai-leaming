/**
 * AI 草稿校对流（docs/flutter-mobile-plan.md §34）。
 *
 * 生命周期：`captured → analyzing → ready/failed → confirmed`，任意状态可 `discarded`。
 *
 * 三条硬约束：
 * 1. **confirm 是单事务**：任意一条 confirmed item 写不进去 → 整体回滚，草稿仍 `ready`；
 * 2. **confirm 幂等**：每道题的幂等键是 `draft:<draftId>:<idx>`（上游操作 ID，跨重试稳定），
 *    重复 confirm 命中既有行只记 `conflicts`，不会重复建题；
 * 3. **归属**：所有入口都按 `user_id` 过滤，别人的草稿一律 404（不区分"不存在/无权"）。
 *
 * 图片按 sha256 落 `data/drafts/<sha256>`：同一张截图重复上传只存一份；请求体用
 * base64（与既有 OCR 约定一致），不引入 multipart 依赖。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { resolveDbFilePath } from "@/lib/db/db-file";
import { withTransaction } from "@/lib/db/executor";
import { performPaddleOCR } from "@/lib/ai/paddle-ocr";
import { generateStructuredData } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { AiRawResponseError } from "@/lib/ai/types";
import { QuestionSchema } from "@/lib/schemas";
import { questionService } from "@/lib/services/question";
import { indexQuestion } from "@/lib/services/question-vector-index";
import {
  BusinessError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { safeParseJson } from "@/lib/utils/json";
import logger from "@/lib/logger";

/** prompt 版本：与 provider/model 一起落库，出问题能定位到哪一版 prompt */
export const DRAFT_PROMPT_VERSION = "draft-v1";
/** 草稿保留 7 天（与移动端"拍照后慢慢校对"的节奏对齐） */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 单张图片上限 12MB（base64 解码后） */
export const DRAFT_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

export type DraftSource = "camera" | "gallery" | "text" | "pdf";
export type DraftStatus =
  | "captured"
  | "analyzing"
  | "ready"
  | "failed"
  | "confirmed"
  | "discarded";

export interface DraftItem {
  idx: number;
  content: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  type: string;
  material_html: string | null;
  confirmed: boolean;
}

export interface DraftRecord {
  id: string;
  user_id: number;
  source: DraftSource;
  status: DraftStatus;
  image_sha256: string | null;
  image_rel_path: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_raw_json: string | null;
  error_code: string | null;
  created_at: string | null;
  expires_at: number | null;
}

export interface DraftWithItems {
  draft: DraftRecord;
  items: DraftItem[];
}

export interface DraftCreateInput {
  source: DraftSource;
  /** data URL 或裸 base64 */
  image_base64?: string;
  image_mime_type?: string;
  file_name?: string;
  /** source=text 时的原文（analyze 直接结构化，不走 OCR） */
  text?: string;
}

export interface DraftAnalyzeResult extends DraftWithItems {
  /** true = 本次识别成功（status 不会是 failed） */
  ok: boolean;
}

export interface DraftItemPatch {
  content?: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  tags?: string[];
  type?: string;
  material_html?: string | null;
  confirmed?: boolean;
  /** true = 删除这一条（idx 不重排，避免前端已渲染的行号错位） */
  deleted?: boolean;
}

export interface DraftConfirmResult {
  created: number;
  skipped: number;
  conflicts: number;
  /** 已写入/已存在的题目 id（按 item idx 对齐） */
  questionIds: number[];
}

export class DraftNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`草稿不存在：${id}`, { code: "draft.not-found" });
  }
}

export class DraftStateError extends ConflictError {
  constructor(message: string) {
    super(message, { code: "draft.state" });
  }
}

export class DraftConfirmError extends BusinessError {
  constructor(issues: string[], message = "存在无法写入的草稿条目") {
    super(message, { code: "draft.confirm.invalid", issues });
  }
}

/** 草稿图片目录：与 DB 文件同级的 `data/drafts`（备份 DB 时不会漏掉图片目录） */
export function resolveDraftDir(): string {
  return path.resolve(path.dirname(resolveDbFilePath()), "drafts");
}

function resolveDraftImagePath(relPath: string): string {
  // relPath 形如 `drafts/<sha256>`，始终相对 data/ 解析，避免 cwd 漂移
  const dataDir = path.dirname(resolveDbFilePath());
  const abs = path.resolve(dataDir, relPath);
  const root = path.resolve(dataDir);
  if (!abs.startsWith(root + path.sep)) {
    throw new ValidationError("非法的草稿图片路径", {
      code: "draft.image.path",
    });
  }
  return abs;
}

function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  return "image/jpeg";
}

/** 接受 `data:image/png;base64,xxx` 与裸 base64 两种形态 */
export function decodeBase64Image(input: string): Buffer {
  const trimmed = input.trim();
  const bare = trimmed.startsWith("data:")
    ? trimmed.slice(trimmed.indexOf(",") + 1)
    : trimmed;
  if (!bare) {
    throw new ValidationError("图片内容为空", { code: "draft.image.empty" });
  }
  const buffer = Buffer.from(bare, "base64");
  if (buffer.length === 0) {
    throw new ValidationError("图片 base64 解码失败", {
      code: "draft.image.base64",
    });
  }
  if (buffer.length > DRAFT_IMAGE_MAX_BYTES) {
    throw new ValidationError(
      `图片过大（${(buffer.length / 1024 / 1024).toFixed(1)}MB），上限 12MB`,
      { code: "draft.image.too-large" },
    );
  }
  return buffer;
}

/** 落盘（`wx` = 已存在即跳过），返回 {sha256, relPath} */
async function storeImage(buffer: Buffer): Promise<{
  sha256: string;
  relPath: string;
}> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const dir = resolveDraftDir();
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.writeFile(path.join(dir, sha256), buffer, { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // 同一个 sha256 已存在 = 去重命中，不是错误
    if (code !== "EEXIST") throw error;
  }
  return { sha256, relPath: path.posix.join("drafts", sha256) };
}

async function readImage(relPath: string): Promise<Buffer> {
  return fs.readFile(resolveDraftImagePath(relPath));
}

/** 过期草稿机会式清理（与 pdf-import 同一取舍：不依赖 setInterval，多实例也安全） */
async function cleanupExpired(): Promise<void> {
  try {
    await drizzleDb
      .delete(drizzleSchema.question_drafts)
      .where(lt(drizzleSchema.question_drafts.expires_at, Date.now()));
  } catch (error) {
    // audit-allow: 清理是尽力而为，失败不能阻断"建草稿"这个主流程
    logger.warn({ err: error }, "[DraftService] 过期草稿清理失败，跳过");
  }
}

function mapDraft(row: Record<string, unknown>): DraftRecord {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    source: row.source as DraftSource,
    status: row.status as DraftStatus,
    image_sha256: (row.image_sha256 as string | null) ?? null,
    image_rel_path: (row.image_rel_path as string | null) ?? null,
    ai_provider: (row.ai_provider as string | null) ?? null,
    ai_model: (row.ai_model as string | null) ?? null,
    ai_prompt_version: (row.ai_prompt_version as string | null) ?? null,
    ai_raw_json: (row.ai_raw_json as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    expires_at: row.expires_at == null ? null : Number(row.expires_at),
  };
}

function mapItem(row: Record<string, unknown>): DraftItem {
  return {
    idx: Number(row.idx),
    content: (row.content as string | null) ?? "",
    options: safeParseJson<string[]>(row.options as string | null, []),
    answer: (row.answer as string | null) ?? "",
    explanation: (row.explanation as string | null) ?? "",
    tags: safeParseJson<string[]>(row.tags as string | null, []),
    type: (row.type as string | null) ?? "single",
    material_html: (row.material_html as string | null) ?? null,
    confirmed: Number(row.confirmed ?? 0) === 1,
  };
}

async function loadDraft(
  userId: number,
  id: string,
): Promise<{ draft: DraftRecord; items: DraftItem[] }> {
  const [row] = await drizzleDb
    .select()
    .from(drizzleSchema.question_drafts)
    .where(
      and(
        eq(drizzleSchema.question_drafts.id, id),
        eq(drizzleSchema.question_drafts.user_id, userId),
      ),
    )
    .limit(1);
  if (!row) throw new DraftNotFoundError(id);

  const itemRows = await drizzleDb
    .select()
    .from(drizzleSchema.question_draft_items)
    .where(eq(drizzleSchema.question_draft_items.draft_id, id))
    .orderBy(asc(drizzleSchema.question_draft_items.idx));

  return {
    draft: mapDraft(row as unknown as Record<string, unknown>),
    items: itemRows.map((item) =>
      mapItem(item as unknown as Record<string, unknown>),
    ),
  };
}

// ---------------- AI 结构化 ----------------

const DraftAiItemSchema = z.object({
  content: z.string().describe("题干（纯文本，保留题号与括号）"),
  options: z.array(z.string()).describe("选项文本数组；填空题为空数组"),
  answer: z
    .string()
    .describe('答案：单选 "A"，多选 JSON 数组字符串 ["A","B"]，判断 A/B，填空为文本'),
  explanation: z.string().describe("解析；原文没有就写简短推理"),
  tags: z.array(z.string()).describe("知识点标签，至少一个"),
  type: z
    .enum(["single", "multi", "truefalse", "fill_blank"])
    .describe("题型"),
  material_html: z
    .string()
    .nullable()
    .optional()
    .describe("材料题共用的材料 HTML；非材料题传 null"),
});

const DraftAiResultSchema = z.object({
  items: z.array(DraftAiItemSchema).min(1),
});

type DraftAiResult = z.infer<typeof DraftAiResultSchema>;

function buildPrompt(recognizedText: string): string {
  return `你是教师招聘考试题库的录入助手。把下面的识别文本拆成结构化题目：

要求：
1. 只输出 JSON 对象 {"items": [...]}，不要解释；
2. 每道题保留完整题干；选项放进 options 数组（不要重复写 "A."）；
3. answer 用选项标号：单选 "A"；多选输出 JSON 数组字符串（如 "[\"A\",\"B\"]"）；
   判断题选项固定 ["正确","错误"] 且答案 "A"/"B"；填空题 answer 写答案文本、options 为空数组；
4. 多个小问（材料题）拆成多条 item，共用材料放进 material_html；
5. tags 至少一个，取知识点而非"选择题"这类描述。

识别文本：
"""${recognizedText}"""
`;
}

function classifyError(error: unknown): string {
  if (error instanceof AiRawResponseError) return "ai_invalid_output";
  if (error instanceof z.ZodError) return "ai_invalid_output";
  const message = error instanceof Error ? error.message : String(error);
  if (/PADDLE_OCR_TOKEN|识别|layout-parsing/i.test(message)) return "ocr_failed";
  return "ai_failed";
}

async function describeAiModel(): Promise<{ provider: string; model: string }> {
  try {
    const config = await getAiConfig("economy");
    let provider = "openai-compatible";
    try {
      provider = new URL(config.baseURL).host;
    } catch {
      // audit-allow: baseURL 可能是相对路径，provider 退化为固定字符串即可
    }
    return { provider, model: config.modelName };
  } catch (error) {
    // audit-allow: 配置读取失败不影响主流程（真正的 AI 调用会给出更准确的错误）
    logger.warn({ err: error }, "[DraftService] 读取 AI 配置失败");
    return { provider: "unknown", model: "unknown" };
  }
}

// ---------------- Service ----------------

export const draftService = {
  create: async (
    userId: number,
    input: DraftCreateInput,
  ): Promise<DraftWithItems> => {
    await cleanupExpired();

    const now = new Date();
    let imageSha: string | null = null;
    let imageRel: string | null = null;

    if (input.image_base64) {
      const buffer = decodeBase64Image(input.image_base64);
      const stored = await storeImage(buffer);
      imageSha = stored.sha256;
      imageRel = stored.relPath;
    }

    if (input.source !== "text" && !imageRel) {
      throw new ValidationError("拍照/相册/PDF 草稿必须带图片", {
        code: "draft.image.required",
      });
    }
    if (input.source === "text" && !input.text?.trim()) {
      throw new ValidationError("文本草稿必须带 text", {
        code: "draft.text.required",
      });
    }

    const id = randomUUID();
    await drizzleDb.insert(drizzleSchema.question_drafts).values({
      id,
      user_id: userId,
      source: input.source,
      status: "captured",
      image_sha256: imageSha,
      image_rel_path: imageRel,
      // 文本草稿把原文先塞进 ai_raw_json 的 input 位？不：ai_raw_json 只存模型返回，
      // 原文暂时放 error_code 会污染语义 —— 用 items 表的一行承载原文更干净
      expires_at: now.getTime() + DRAFT_TTL_MS,
    });

    if (input.source === "text" && input.text) {
      await drizzleDb.insert(drizzleSchema.question_draft_items).values({
        draft_id: id,
        idx: 0,
        content: input.text,
        options: JSON.stringify([]),
        tags: JSON.stringify([]),
        type: "single",
        confirmed: 0,
      });
    }

    return loadDraft(userId, id);
  },

  get: async (userId: number, id: string): Promise<DraftWithItems> => {
    return loadDraft(userId, id);
  },

  analyze: async (
    userId: number,
    id: string,
  ): Promise<DraftAnalyzeResult> => {
    const { draft, items } = await loadDraft(userId, id);
    if (draft.status === "discarded") {
      throw new DraftStateError("草稿已丢弃，不能识别");
    }
    if (draft.status === "confirmed") {
      throw new DraftStateError("草稿已确认入库，不能重新识别");
    }
    if (draft.status === "ready") {
      throw new DraftStateError("草稿已识别完成，直接校对即可");
    }

    // captured / analyzing（上次进程中断留下的卡死态）/ failed 都允许重新识别
    await drizzleDb
      .update(drizzleSchema.question_drafts)
      .set({ status: "analyzing", error_code: null })
      .where(
        and(
          eq(drizzleSchema.question_drafts.id, id),
          eq(drizzleSchema.question_drafts.user_id, userId),
        ),
      );

    const aiMeta = await describeAiModel();
    let recognizedText = "";
    let aiResult: DraftAiResult | null = null;
    let rawText: string | null = null;

    try {
      if (draft.source === "text") {
        recognizedText = items[0]?.content ?? "";
        if (!recognizedText.trim()) {
          throw new ValidationError("文本草稿内容为空", {
            code: "draft.text.empty",
          });
        }
      } else {
        if (!draft.image_rel_path) {
          throw new ValidationError("草稿缺少图片，无法识别", {
            code: "draft.image.missing",
          });
        }
        const buffer = await readImage(draft.image_rel_path);
        const mime = detectImageMime(buffer);
        recognizedText = await performPaddleOCR(
          buffer,
          `draft-${draft.image_sha256 ?? id}`,
          mime,
        );
        if (!recognizedText.trim()) {
          throw new Error("OCR 未识别出任何文字");
        }
      }

      aiResult = await generateStructuredData<DraftAiResult>(
        DraftAiResultSchema,
        buildPrompt(recognizedText),
        "economy",
      );
      // 再校验一次：兼容模式（文本 + 手动提 JSON）可能绕过 schema 的部分约束
      aiResult = DraftAiResultSchema.parse(aiResult);
      rawText = JSON.stringify(aiResult);
    } catch (error) {
      const errorCode = classifyError(error);
      if (error instanceof AiRawResponseError) rawText = error.rawResponse ?? null;
      await drizzleDb
        .update(drizzleSchema.question_drafts)
        .set({
          status: "failed",
          error_code: errorCode,
          ai_provider: aiMeta.provider,
          ai_model: aiMeta.model,
          ai_prompt_version: DRAFT_PROMPT_VERSION,
          ...(rawText ? { ai_raw_json: rawText } : {}),
        })
        .where(
          and(
            eq(drizzleSchema.question_drafts.id, id),
            eq(drizzleSchema.question_drafts.user_id, userId),
          ),
        );
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          draftId: id,
          errorCode,
        },
        "[DraftService] 草稿识别失败（可重试）",
      );
      const failed = await loadDraft(userId, id);
      return { ...failed, ok: false };
    }

    const parsedItems = aiResult.items.map((item) => {
      // 草稿阶段不要求模型判"能力维度"：统一按 knowledge 落库，人工校对时可改
      const normalized = QuestionSchema.safeParse({
        ...item,
        dimension: "knowledge",
      });
      // 识别结果不合题库规则不算"识别失败"：保留原文交给人工校对，标记未确认
      if (!normalized.success) {
        return {
          ...item,
          options: JSON.stringify(item.options ?? []),
          tags: JSON.stringify(item.tags ?? []),
          material_html: item.material_html ?? null,
        };
      }
      return {
        ...normalized.data,
        options: JSON.stringify(normalized.data.options),
        tags: JSON.stringify(normalized.data.tags),
        material_html: item.material_html ?? null,
      };
    });

    await withTransaction(async (exec) => {
      await exec
        .delete(drizzleSchema.question_draft_items)
        .where(eq(drizzleSchema.question_draft_items.draft_id, id));
      if (parsedItems.length > 0) {
        await exec.insert(drizzleSchema.question_draft_items).values(
          parsedItems.map((item, index) => ({
            draft_id: id,
            idx: index,
            content: item.content,
            options: item.options,
            answer: item.answer,
            explanation: item.explanation,
            tags: item.tags,
            type: item.type,
            material_html: item.material_html,
            confirmed: 0,
          })) as never,
        );
      }
      await exec
        .update(drizzleSchema.question_drafts)
        .set({
          status: "ready",
          error_code: null,
          ai_provider: aiMeta.provider,
          ai_model: aiMeta.model,
          ai_prompt_version: DRAFT_PROMPT_VERSION,
          ai_raw_json: rawText,
        })
        .where(eq(drizzleSchema.question_drafts.id, id));
    });

    const ready = await loadDraft(userId, id);
    return { ...ready, ok: true };
  },

  updateItem: async (
    userId: number,
    id: string,
    idx: number,
    patch: DraftItemPatch,
  ): Promise<DraftWithItems> => {
    const { draft } = await loadDraft(userId, id);
    if (draft.status === "confirmed") {
      throw new DraftStateError("草稿已确认入库，条目不可再改");
    }
    if (draft.status === "discarded") {
      throw new DraftStateError("草稿已丢弃");
    }

    const [existing] = await drizzleDb
      .select()
      .from(drizzleSchema.question_draft_items)
      .where(
        and(
          eq(drizzleSchema.question_draft_items.draft_id, id),
          eq(drizzleSchema.question_draft_items.idx, idx),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundError(`草稿条目不存在：${id}#${idx}`, {
        code: "draft.item.not-found",
      });
    }

    if (patch.deleted) {
      await drizzleDb
        .delete(drizzleSchema.question_draft_items)
        .where(
          and(
            eq(drizzleSchema.question_draft_items.draft_id, id),
            eq(drizzleSchema.question_draft_items.idx, idx),
          ),
        );
      return loadDraft(userId, id);
    }

    const values: Record<string, unknown> = {};
    if (patch.content !== undefined) values.content = patch.content;
    if (patch.options !== undefined) values.options = JSON.stringify(patch.options);
    if (patch.answer !== undefined) values.answer = patch.answer;
    if (patch.explanation !== undefined) values.explanation = patch.explanation;
    if (patch.tags !== undefined) values.tags = JSON.stringify(patch.tags);
    if (patch.type !== undefined) values.type = patch.type;
    if (patch.material_html !== undefined) {
      values.material_html = patch.material_html;
    }
    if (patch.confirmed !== undefined) {
      values.confirmed = patch.confirmed ? 1 : 0;
    }

    if (Object.keys(values).length > 0) {
      await drizzleDb
        .update(drizzleSchema.question_draft_items)
        .set(values)
        .where(
          and(
            eq(drizzleSchema.question_draft_items.draft_id, id),
            eq(drizzleSchema.question_draft_items.idx, idx),
          ),
        );
    }

    return loadDraft(userId, id);
  },

  /**
   * 确认入库：**单事务**，任意一条失败整体回滚。
   *
   * 幂等键 `draft:<draftId>:<idx>`：重复 confirm 时已写入的条目命中既有行，
   * 记为 `conflicts`（`created=0`），不会重复建题。
   */
  confirm: async (
    userId: number,
    id: string,
    actor: { username: string },
  ): Promise<DraftConfirmResult> => {
    const { draft, items } = await loadDraft(userId, id);
    if (draft.status === "discarded") {
      throw new DraftStateError("草稿已丢弃，不能确认");
    }

    const confirmedItems = items.filter((item) => item.confirmed);
    const skipped = items.length - confirmedItems.length;
    if (confirmedItems.length === 0) {
      return { created: 0, skipped, conflicts: 0, questionIds: [] };
    }

    // 先聚合全部校验问题：调用方一次能看到所有坏条目，而不是改一条报一条
    const issues: string[] = [];
    const inputs = confirmedItems.map((item) => {
      const parsed = QuestionSchema.safeParse({
        content: item.content,
        options: item.options,
        answer: item.answer,
        explanation: item.explanation,
        tags: item.tags,
        type: item.type,
        dimension: "knowledge",
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push(
            `items[${item.idx}].${issue.path.join(".") || "body"}: ${issue.message}`,
          );
        }
        return null;
      }
      return { idx: item.idx, data: parsed.data, item };
    });
    if (issues.length > 0 || inputs.some((input) => input === null)) {
      throw new DraftConfirmError(issues.length > 0 ? issues : ["草稿条目校验失败"]);
    }

    const createdIds: number[] = [];
    const existingIds: number[] = [];

    await withTransaction(async (exec) => {
      for (const input of inputs) {
        if (!input) continue;
        const { idx, data, item } = input;
        const externalId = `draft:${id}:${idx}`;
        const result = await questionService.create(
          {
            content: data.content,
            options: data.options,
            answer: data.answer,
            explanation: data.explanation,
            tags: data.tags,
            dimension: data.dimension as
              | "knowledge"
              | "understanding"
              | "application",
            type: data.type,
            material_html: item.material_html,
            source: "draft",
          } as never,
          {
            actor: { id: userId, username: actor.username },
            externalId,
            source: "draft",
            validated: true,
            exec,
            audit: false,
            indexVector: false,
          },
        );
        if (result.created) createdIds.push(result.id);
        else existingIds.push(result.id);
      }

      await exec
        .update(drizzleSchema.question_drafts)
        .set({ status: "confirmed" })
        .where(eq(drizzleSchema.question_drafts.id, id));
    });

    // 事务提交后再建向量：索引是独立连接，事务内看不到未提交的行
    for (const questionId of createdIds) {
      void indexQuestion(questionId).catch((error: unknown) => {
        logger.warn(
          { err: error, questionId },
          "[DraftService] 草稿确认后向量索引失败",
        );
      });
    }

    return {
      created: createdIds.length,
      skipped,
      conflicts: existingIds.length,
      questionIds: [...createdIds, ...existingIds],
    };
  },

  /** 丢弃：软删除（保留行便于排障与幂等判定） */
  discard: async (
    userId: number,
    id: string,
  ): Promise<{ id: string; status: DraftStatus }> => {
    const { draft } = await loadDraft(userId, id);
    if (draft.status === "discarded") {
      return { id, status: "discarded" };
    }
    await drizzleDb
      .update(drizzleSchema.question_drafts)
      .set({ status: "discarded" })
      .where(
        and(
          eq(drizzleSchema.question_drafts.id, id),
          eq(drizzleSchema.question_drafts.user_id, userId),
        ),
      );
    return { id, status: "discarded" };
  },

  /** 仅供测试/排障：清空过期草稿 */
  cleanupExpired,
};
