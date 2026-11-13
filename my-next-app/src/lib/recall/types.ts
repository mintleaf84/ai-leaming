import { z } from "zod";

/**
 * 回忆自测的数据契约（规格 docs/ai-learning-recall-spec.md §1）。
 *
 * 这里只描述**卡组文件**与**判分/日志**的形状，不碰数据库行：
 * - 卡组与卡片内容全局共享（文件即事实来源），复习状态与日志按用户隔离；
 * - `schema` 只接受 1；未知版本一律拒绝导入（不做兼容猜测）。
 *
 * 判分口径（P1 只定型，P2 实现匹配器时严格照此）：
 * - 归一化只有三步：去首尾/连续空白、去中英文标点、全角转半角。
 *   `verbatim: true` 也走**同一套**归一化——拼音容错延后，等真实错别字反馈再上
 *   （引 `pinyin-pro`/繁简转换现在就等于凭空加两个大依赖且没有基准集可验）。
 * - 条目判「已写」= `keywords` 任一命中（子串包含，忽略大小写）。
 * - 评分推导（用户永远看不到评分按钮，`Easy` 不使用）：
 *   呈现的条目全对 → `Good`；仍有错 → `Hard`；点「全没想起」→ `Again`。
 *   首发（`mode="first"`）与重测（`mode="retest"`）用**同一套**推导，唯一区别是
 *   输入条目集：重测只呈现 `pendingItems` 里的条目，因此"上次错过"不会额外扣分。
 */

/** 当前唯一支持的卡组文件版本 */
export const RECALL_SCHEMA_VERSION = 1;

/** 列举卡最多 6 条（规格 §1.2：超出拆卡） */
export const RECALL_MAX_LIST_ITEMS = 6;
/** 填空每空最多 3 个可接受答案（规格 §1.2） */
export const RECALL_MAX_BLANK_ANSWERS = 3;

const identifier = z
  .string()
  .trim()
  .min(1, "不能为空")
  .max(120, "长度不能超过 120");

const text = z.string().trim().min(1, "不能为空");

/** 分组（可选的一层树；示例卡组用 47 节点树） */
export const recallGroupSchema = z.object({
  groupId: identifier,
  title: text,
  order: z.number().int().optional(),
});
export type RecallGroup = z.infer<typeof recallGroupSchema>;

/** 列举卡的条目：`keywords` 任一命中即判「已写」 */
export const recallListItemSchema = z.object({
  text: text,
  keywords: z
    .array(text)
    .min(1, "至少 1 个关键词，否则该条目永远判不出「已写」")
    .max(20, "关键词过多（≤20）"),
});
export type RecallListItem = z.infer<typeof recallListItemSchema>;

/** 填空卡的一个空：answers 1–3 项，归一化后精确或包含匹配 */
export const recallBlankSchema = z.object({
  answers: z
    .array(text)
    .min(1, "至少 1 个可接受答案")
    .max(
      RECALL_MAX_BLANK_ANSWERS,
      `每个空最多 ${RECALL_MAX_BLANK_ANSWERS} 个可接受答案`,
    ),
});
export type RecallBlank = z.infer<typeof recallBlankSchema>;

export const recallListCardSchema = z.object({
  cardId: identifier,
  kind: z.literal("list"),
  groupId: identifier.optional(),
  prompt: text,
  items: z
    .array(recallListItemSchema)
    .min(1, "至少 1 个条目")
    .max(
      RECALL_MAX_LIST_ITEMS,
      `条目最多 ${RECALL_MAX_LIST_ITEMS} 条，超出请拆卡`,
    ),
  verbatim: z.boolean().default(false),
});

export const recallClozeCardSchema = z.object({
  cardId: identifier,
  kind: z.literal("cloze"),
  groupId: identifier.optional(),
  prompt: text,
  blanks: z.array(recallBlankSchema).min(1, "至少 1 个空"),
});

export const recallCardSchema = z.discriminatedUnion("kind", [
  recallListCardSchema,
  recallClozeCardSchema,
]);
export type RecallListCard = z.infer<typeof recallListCardSchema>;
export type RecallClozeCard = z.infer<typeof recallClozeCardSchema>;
export type RecallCard = z.infer<typeof recallCardSchema>;
export type RecallCardKind = RecallCard["kind"];

/** 卡组文件（导入导出同格式，规格 §1.1） */
export const recallDeckSchema = z
  .object({
    schema: z.literal(RECALL_SCHEMA_VERSION),
    deckId: identifier,
    title: text,
    groups: z.array(recallGroupSchema).default([]),
    cards: z.array(recallCardSchema).min(1, "卡组至少 1 张卡"),
  })
  .superRefine((deck, ctx) => {
    const seenCardIds = new Map<string, number>();
    deck.cards.forEach((card, index) => {
      const first = seenCardIds.get(card.cardId);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          // 定位到具体卡片：错误信息里要能直接看出是哪一张重复了
          path: ["cards", index, "cardId"],
          message: `cardId 重复（与 cards[${first}] 相同）`,
        });
        return;
      }
      seenCardIds.set(card.cardId, index);
    });

    const seenGroupIds = new Map<string, number>();
    deck.groups.forEach((group, index) => {
      const first = seenGroupIds.get(group.groupId);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["groups", index, "groupId"],
          message: `groupId 重复（与 groups[${first}] 相同）`,
        });
        return;
      }
      seenGroupIds.set(group.groupId, index);
    });

    // 卡片引用了不存在的分组：只是展示归属错误，允许导入会静默产出"孤儿卡"，
    // 因此在这里挡掉（P1 没有分组编辑界面，用户无法自行修复）
    deck.cards.forEach((card, index) => {
      if (card.groupId && !seenGroupIds.has(card.groupId)) {
        ctx.addIssue({
          code: "custom",
          path: ["cards", index, "groupId"],
          message: `分组 ${card.groupId} 不在 groups 里`,
        });
      }
    });
  });
export type RecallDeckFile = z.infer<typeof recallDeckSchema>;

// --- 导入 / 导出结果（服务层契约） ---

/** 冲突处理策略：keep = 保留库内内容；accept = 采用文件内容（进度不动） */
export type RecallImportConflictStrategy = "keep" | "accept";

/** 冲突卡的处理结果。skip 不在这里出现：内容一致时记为 skippedCards */
export interface RecallImportConflict {
  cardId: string;
  action: "keep" | "accept";
}

export interface RecallImportResult {
  deckId: number;
  deckKey: string;
  cardCount: number;
  createdCards: number;
  /** 内容被文件覆盖的卡片数（仅 accept 且 hash 变化） */
  updatedCards: number;
  /** prompt_hash 相同、完全跳过的卡片数（不重置任何进度） */
  skippedCards: number;
  conflicts: RecallImportConflict[];
  /** 库里有、文件里没有的 cardId（P1 不删除，交给 UI 提示） */
  missingInFile: string[];
}

/** 卡组列表条目（P1 只用于卡组选择页） */
export interface RecallDeckSummary {
  deckId: number;
  deckKey: string;
  title: string;
  cardCount: number;
  /** 该用户已归档（移出队列）的卡片数 */
  archivedCount: number;
  /** 该用户未归档、且已有复习状态的卡片数（含今天未到期的） */
  activeCount: number;
  /** 完全没有复习状态的卡片数（新卡池） */
  untouchedCount: number;
  /** 该用户当前到期可复习的卡片数 */
  dueCount: number;
}

// --- 判分 / 日志形状（P1 定义，P2 起由 services/recall.ts 写入） ---

/** 条目判分：ok = 判已写；miss = 判未写 */
export type RecallItemVerdict = "ok" | "miss";
export type RecallMode = "first" | "retest";
/** FSRS 评分推导结果（Easy 不使用，规格 §2.2） */
export type RecallDerivedRating = "again" | "hard" | "good";

export interface RecallUserOverride {
  index: number;
  to: RecallItemVerdict;
}

/**
 * 一次作答的判分结果。
 *
 * `keywordHits` / `keywordTotal` 是**数据留痕**字段（P2 起由服务层写入）：
 * 等真实作答累积后，用它判断「关键词任一命中」规则是否过松/过严，再决定要不要
 * 改规则；没有这两个数，事后只能靠用户改判反推。
 */
export interface RecallReviewVerdictLog {
  cardId: string;
  ts: string;
  mode: RecallMode;
  algoVerdicts: RecallItemVerdict[];
  userOverrides: RecallUserOverride[];
  keywordHits: number;
  keywordTotal: number;
  derivedRating: RecallDerivedRating;
  typedAnswer?: string;
}
