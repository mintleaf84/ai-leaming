import { createHash } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "../db";
import { safeParseJson } from "../utils/json";
import { withImportLock } from "./import-service";
import { parseRecallDeck, RecallDeckValidationError } from "../recall/schema";
import {
  RECALL_SCHEMA_VERSION,
  recallDeckSchema,
  type RecallBlank,
  type RecallCard,
  type RecallDeckFile,
  type RecallDeckSummary,
  type RecallGroup,
  type RecallImportConflict,
  type RecallImportConflictStrategy,
  type RecallImportResult,
  type RecallListItem,
} from "../recall/types";

const { recall_decks, recall_cards, recall_card_states } = drizzleSchema;

/**
 * 回忆自测卡组的导入 / 导出 / 列表。
 *
 * 边界（规格 §0、§1）：
 * - **卡组与卡片内容全局共享**：`deck_key` / `(deck_id, card_key)` 是幂等键，
 *   不带 user_id；复习进度（`recall_card_states`）按用户隔离，导入**永不触碰**它；
 * - **导入幂等**：同一份文件重复导入不新增、不重置进度；内容变化按 prompt 哈希
 *   判定冲突，默认保留库内内容（keep），用户选择后可用 accept 覆盖内容；
 * - 文件里没有的卡片**不删除**，只在返回值里报告，交给 UI 提示。
 */

export class RecallImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecallImportError";
  }
}

/**
 * 导入串行锁。
 *
 * `@libsql/client` 的本地文件驱动只有一条连接，两个 `transaction()` 并发时会
 * 互相踩（"SQL statements in progress"）。与 `import-service.ts` 同因同解：
 * 服务层排队。没有复用那边的是因为它的队列是模块私有、且与粉笔导入的幂等分支
 * 绑在一起；这里再抽公共基础设施的收益小于改动既有导入链的风险。
 */
/**
 * 复用 `import-service` 的**全站导入锁**：两条导入链路共用同一条 SQLite 连接，
 * 各持一把锁无法互斥（粉笔导入进行中再开回忆导入照样会撞 statements-in-progress）。
 */
const withRecallImportLock = withImportLock;

/**
 * 内容指纹。参与计算的是**会影响判分或题干**的东西：prompt、条目文本与关键词、
 * 填空答案、verbatim 开关。
 *
 * 归一化只做 trim + 折叠空白 + 大小写折叠（关键词匹配本身就忽略大小写），
 * 否则纯排版差异（多一个空格）就会被判成"内容变更"，用户会收到一堆假冲突。
 */
function compactForHash(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function computeCardPromptHash(card: RecallCard): string {
  // 必须保留**结构与分组**：`answers: ["a","b"]` 与 `answers: ["a"], ["b"]`
  // 拼平之后一模一样，只用 join 会漏掉这种内容变更；groupId 改变同理。
  const canonical =
    card.kind === "list"
      ? {
          kind: "list",
          groupId: card.groupId ?? null,
          prompt: compactForHash(card.prompt),
          verbatim: Boolean(card.verbatim),
          items: card.items.map((item) => ({
            text: compactForHash(item.text),
            keywords: item.keywords.map(compactForHash),
          })),
        }
      : {
          kind: "cloze",
          groupId: card.groupId ?? null,
          prompt: compactForHash(card.prompt),
          blanks: card.blanks.map((blank) => ({
            answers: blank.answers.map(compactForHash),
          })),
        };
  return createHash("sha1").update(JSON.stringify(canonical)).digest("hex");
}

/** 卡片 → 行字段（items/blanks 各存 JSON，另一列留 NULL） */
function toCardColumns(card: RecallCard) {
  return {
    kind: card.kind,
    group_key: card.groupId ?? null,
    prompt: card.prompt,
    items_json: card.kind === "list" ? JSON.stringify(card.items) : null,
    blanks_json: card.kind === "cloze" ? JSON.stringify(card.blanks) : null,
    verbatim: card.kind === "list" && card.verbatim ? 1 : 0,
    prompt_hash: computeCardPromptHash(card),
  };
}

/**
 * 分组元数据并集：文件里的分组覆盖同名项（标题/顺序以文件为准），
 * 库里已有但文件没提到的分组保留 —— 被保留的旧卡仍需要它们的标题。
 */
async function mergeGroups(
  exec: typeof drizzleDb,
  deckId: number | undefined,
  fileGroups: RecallDeckFile["groups"],
): Promise<RecallDeckFile["groups"]> {
  const merged = new Map<string, RecallDeckFile["groups"][number]>();
  if (deckId !== undefined) {
    const [row] = await exec
      .select({ groups_json: recall_decks.groups_json })
      .from(recall_decks)
      .where(eq(recall_decks.id, deckId))
      .limit(1);
    for (const group of safeParseJson<RecallDeckFile["groups"]>(
      row?.groups_json,
      [],
    )) {
      merged.set(group.groupId, group);
    }
    // 保险：库里卡片引用但 groups 里缺失的分组，用 groupId 占位，避免导出时丢引用
    const cardGroups = await exec
      .selectDistinct({ group_key: recall_cards.group_key })
      .from(recall_cards)
      .where(eq(recall_cards.deck_id, deckId));
    for (const { group_key } of cardGroups) {
      if (group_key && !merged.has(group_key)) {
        merged.set(group_key, {
          groupId: group_key,
          title: group_key,
          order: 999,
        });
      }
    }
  }
  for (const group of fileGroups) merged.set(group.groupId, group);
  return [...merged.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function writeDeck(
  exec: typeof drizzleDb,
  userId: number,
  deck: RecallDeckFile,
  onConflict: RecallImportConflictStrategy,
): Promise<RecallImportResult> {
  const [existingDeck] = await exec
    .select({
      id: recall_decks.id,
      owner_user_id: recall_decks.owner_user_id,
      title: recall_decks.title,
      schema_version: recall_decks.schema_version,
      groups_json: recall_decks.groups_json,
    })
    .from(recall_decks)
    .where(eq(recall_decks.deck_key, deck.deckId))
    .limit(1);

  // 分组元数据要**并集**而不是覆盖：文件里没提到的分组，可能还有被保留的旧卡在用，
  // 直接写文件里的 groups 会让这些卡失去分组标题与顺序。
  const groups = await mergeGroups(exec, existingDeck?.id, deck.groups);
  const groupsJson = JSON.stringify(groups);

  let deckId: number;
  if (existingDeck) {
    if (
      existingDeck.owner_user_id !== null &&
      existingDeck.owner_user_id !== userId
    ) {
      throw new RecallImportError(
        `卡组 ${deck.deckId} 属于其他用户（owner_user_id=${existingDeck.owner_user_id}），不能覆盖`,
      );
    }
    deckId = existingDeck.id;
    // 只在真有变化时写：重复导入同一份文件应该对库**零写入**（连 updated_at 都不动）
    const deckChanged =
      existingDeck.title !== deck.title ||
      existingDeck.schema_version !== deck.schema ||
      existingDeck.groups_json !== groupsJson;
    if (deckChanged) {
      await exec
        .update(recall_decks)
        .set({
          title: deck.title,
          schema_version: deck.schema,
          groups_json: groupsJson,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(recall_decks.id, deckId));
    }
  } else {
    // 文件导入的卡组天然是公共卡组（owner 为 NULL）：内容是全局共享的，
    // 谁先导入都不该获得"所有权"，否则第二个人导入同一份文件就会被挡住。
    const inserted = await exec
      .insert(recall_decks)
      .values({
        deck_key: deck.deckId,
        title: deck.title,
        schema_version: deck.schema,
        groups_json: groupsJson,
        owner_user_id: null,
      })
      .returning({ id: recall_decks.id });
    deckId = inserted[0].id;
  }

  const existingCards = await exec
    .select({
      id: recall_cards.id,
      card_key: recall_cards.card_key,
      prompt_hash: recall_cards.prompt_hash,
    })
    .from(recall_cards)
    .where(eq(recall_cards.deck_id, deckId));
  const existingByKey = new Map(
    existingCards.map((row) => [row.card_key, row]),
  );

  const fileCardKeys = new Set<string>();
  const conflicts: RecallImportConflict[] = [];
  let createdCards = 0;
  let updatedCards = 0;
  let skippedCards = 0;

  for (const card of deck.cards) {
    fileCardKeys.add(card.cardId);
    const columns = toCardColumns(card);
    const row = existingByKey.get(card.cardId);

    if (!row) {
      await exec
        .insert(recall_cards)
        .values({ deck_id: deckId, card_key: card.cardId, ...columns });
      createdCards += 1;
      continue;
    }

    if (row.prompt_hash === columns.prompt_hash) {
      // 内容没变：一行都不写（含 updated_at），保证"重复导入"对库零副作用
      skippedCards += 1;
      continue;
    }

    if (onConflict === "accept") {
      // 覆盖内容，但 **prompt_hash 之外的列里没有任何进度字段**：
      // recall_card_states 是独立表，这里根本不会碰它，进度自然保留。
      await exec
        .update(recall_cards)
        .set({ ...columns, updated_at: sql`CURRENT_TIMESTAMP` })
        .where(eq(recall_cards.id, row.id));
      updatedCards += 1;
      conflicts.push({ cardId: card.cardId, action: "accept" });
      continue;
    }

    // keep：内容一字不动，只戳 updated_at，让 UI 能看出"这次导入碰过它"。
    // 有意**不更新 prompt_hash**：在用户点"采用新文件"之前，这个冲突必须每次
    // 导入都继续报出来；若把 hash 改成新值，下次就会被当成"内容一致"静默跳过。
    await exec
      .update(recall_cards)
      .set({ updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(recall_cards.id, row.id));
    conflicts.push({ cardId: card.cardId, action: "keep" });
  }

  const missingInFile = existingCards
    .filter((row) => !fileCardKeys.has(row.card_key))
    .map((row) => row.card_key)
    .sort();

  return {
    deckId,
    deckKey: deck.deckId,
    cardCount: deck.cards.length,
    createdCards,
    updatedCards,
    skippedCards,
    conflicts,
    missingInFile,
  };
}

/**
 * 导入卡组。
 *
 * @param userId  操作者（P1 只用于卡组归属校验；不写任何用户数据）
 * @param deckInput 卡组对象或 JSON 字符串
 * @param options.onConflict 内容冲突时的策略，默认 `keep`（保留我的）
 */
export async function importDeck(
  userId: number,
  deckInput: unknown,
  options: { onConflict?: RecallImportConflictStrategy } = {},
): Promise<RecallImportResult> {
  const onConflict = options.onConflict ?? "keep";
  if (onConflict !== "keep" && onConflict !== "accept") {
    throw new RecallImportError(
      `未知的冲突策略：${String(onConflict)}（只接受 keep / accept）`,
    );
  }

  // 校验在事务外：任何解析/校验失败都保证库里零写入（规格 §6 验收 1、5 的前提）
  const deck = parseRecallDeck(deckInput);

  return withRecallImportLock(() =>
    drizzleDb.transaction(async (tx) => {
      // 事务内所有写操作都必须走 tx：用全局 drizzleDb 会让语句跑在事务连接之外
      const exec = tx as unknown as typeof drizzleDb;
      return writeDeck(exec, userId, deck, onConflict);
    }),
  );
}

/**
 * 导出卡组定义（规格 §1.1：导入导出同格式）。
 *
 * 只输出卡组定义：**不含** `recall_card_states` / `recall_review_logs` 的任何字段，
 * 因此导出文件天然不含 typedAnswer、due、stability 等个人数据（隐私边界）。
 */
export async function exportDeck(deckKey: string): Promise<RecallDeckFile> {
  const [deck] = await drizzleDb
    .select()
    .from(recall_decks)
    .where(eq(recall_decks.deck_key, deckKey))
    .limit(1);
  if (!deck) {
    throw new RecallImportError(`卡组不存在：${deckKey}`);
  }

  const rows = await drizzleDb
    .select()
    .from(recall_cards)
    .where(eq(recall_cards.deck_id, deck.id))
    .orderBy(asc(recall_cards.id));

  const groups: RecallGroup[] = safeParseJson<RecallGroup[]>(
    deck.groups_json,
    [],
  );
  const knownGroupIds = new Set(groups.map((group) => group.groupId));
  // 卡片引用了一个 groups 里没登记的分组（P2 的建卡界面可能产生）：补一条
  // title=groupId 的占位分组，宁可标题退化也不能导出一个自身校验不过的文件。
  for (const row of rows) {
    if (row.group_key && !knownGroupIds.has(row.group_key)) {
      knownGroupIds.add(row.group_key);
      groups.push({ groupId: row.group_key, title: row.group_key });
    }
  }

  const cards: RecallCard[] = rows.map((row) => {
    const base = {
      cardId: row.card_key,
      ...(row.group_key ? { groupId: row.group_key } : {}),
    };
    if (row.kind === "cloze") {
      return {
        ...base,
        kind: "cloze" as const,
        prompt: row.prompt,
        blanks: safeParseJson<RecallBlank[]>(row.blanks_json, []),
      };
    }
    return {
      ...base,
      kind: "list" as const,
      prompt: row.prompt,
      items: safeParseJson<RecallListItem[]>(row.items_json, []),
      verbatim: row.verbatim === 1,
    };
  });

  const file: RecallDeckFile = {
    schema: RECALL_SCHEMA_VERSION,
    deckId: deck.deck_key,
    title: deck.title,
    groups,
    cards,
  };

  // 自检：导出必须能原样再导入（round-trip）。库里若有人手改坏的行，
  // 在这里报具体卡片，而不是等用户导入时才发现。
  const checked = recallDeckSchema.safeParse(file);
  if (!checked.success) {
    throw new RecallDeckValidationError(
      checked.error.issues.map((issue) => {
        const path = issue.path.map(String).join(".");
        return `${path || "deck"}: ${issue.message}`;
      }),
    );
  }
  return checked.data;
}

/**
 * 卡组列表 + 该用户的进度统计（P1 只够卡组选择页用）。
 *
 * `dueCount` 的 `due` 与到期判断都按 ISO 8601 UTC 字符串比较：`text` 列做字典序
 * 比较即可，前提是写入侧统一用 `toISOString()`（P2 的队列写入必须遵守）。
 */
export async function listDecks(userId: number): Promise<RecallDeckSummary[]> {
  const nowIso = new Date().toISOString();

  const deckRows = await drizzleDb
    .select({
      id: recall_decks.id,
      deckKey: recall_decks.deck_key,
      title: recall_decks.title,
      cardCount: sql<number>`count(${recall_cards.id})`,
    })
    .from(recall_decks)
    .leftJoin(recall_cards, eq(recall_cards.deck_id, recall_decks.id))
    .groupBy(recall_decks.id)
    .orderBy(asc(recall_decks.title));

  const stateRows = await drizzleDb
    .select({
      deckId: recall_cards.deck_id,
      archived: recall_card_states.archived,
      total: sql<number>`count(*)`,
      due: sql<number>`sum(case when ${recall_card_states.due} is not null and ${recall_card_states.due} <= ${nowIso} then 1 else 0 end)`,
    })
    .from(recall_card_states)
    .innerJoin(recall_cards, eq(recall_cards.id, recall_card_states.card_id))
    .where(eq(recall_card_states.user_id, userId))
    .groupBy(recall_cards.deck_id, recall_card_states.archived);

  type StateAgg = {
    archivedCount: number;
    activeCount: number;
    dueCount: number;
  };
  const byDeck = new Map<number, StateAgg>();
  for (const row of stateRows) {
    const agg = byDeck.get(row.deckId) ?? {
      archivedCount: 0,
      activeCount: 0,
      dueCount: 0,
    };
    const total = Number(row.total) || 0;
    if (Number(row.archived) === 1) {
      agg.archivedCount += total;
    } else {
      agg.activeCount += total;
      agg.dueCount += Number(row.due) || 0;
    }
    byDeck.set(row.deckId, agg);
  }

  return deckRows.map((row) => {
    const cardCount = Number(row.cardCount) || 0;
    const agg = byDeck.get(row.id) ?? {
      archivedCount: 0,
      activeCount: 0,
      dueCount: 0,
    };
    return {
      deckId: row.id,
      deckKey: row.deckKey,
      title: row.title,
      cardCount,
      archivedCount: agg.archivedCount,
      activeCount: agg.activeCount,
      untouchedCount: Math.max(
        0,
        cardCount - agg.archivedCount - agg.activeCount,
      ),
      dueCount: agg.dueCount,
    };
  });
}

/** 供 P2 队列使用：某用户在某卡组里到期的未归档卡片（id 升序，保证稳定） */
export async function listDueCardIds(
  userId: number,
  deckId: number,
  now: Date = new Date(),
): Promise<number[]> {
  const rows = await drizzleDb
    .select({ cardId: recall_card_states.card_id })
    .from(recall_card_states)
    .innerJoin(recall_cards, eq(recall_cards.id, recall_card_states.card_id))
    .where(
      and(
        eq(recall_card_states.user_id, userId),
        eq(recall_cards.deck_id, deckId),
        eq(recall_card_states.archived, 0),
        sql`${recall_card_states.due} is not null and ${recall_card_states.due} <= ${now.toISOString()}`,
      ),
    )
    .orderBy(asc(recall_card_states.card_id));
  return rows.map((row) => row.cardId);
}
