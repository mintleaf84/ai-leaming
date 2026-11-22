/**
 * 教综知识图谱：库访问层（导入落库 / 读图 / 题→节点 / 节点级掌握度）。
 *
 * 门禁与纯校验在 `src/lib/kg/validate.ts`；这里只做 DB 读写，保持路由层
 * 「校验 → 事务写入 → 形状映射」三段式。import 的幂等键与迁移里的一致：
 * - kg_nodes      (chapter, node_key)
 * - kg_edges      (chapter, from_key, to_key, type)
 * - question_nodes(question_id, node_key)
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import type { KgNodeKind } from "@/lib/kg/relation-types";
import type {
  KgCoverage,
  NormalizedKgEdge,
  NormalizedKgNode,
} from "@/lib/kg/validate";

const {
  kg_nodes,
  kg_edges,
  question_nodes,
  questions,
  practice_logs,
  agent_question_sets,
} = drizzleSchema;

export interface KgImportCounts {
  nodes: number;
  edges: number;
}

export interface KgImportOutcome {
  created: KgImportCounts;
  updated: KgImportCounts;
  skipped: KgImportCounts;
}

export interface KgImportPreview {
  wouldCreateNodes: number;
  wouldCreateEdges: number;
  wouldUpdateNodes: number;
  wouldUpdateEdges: number;
}

function sameNode(row: typeof kg_nodes.$inferSelect, node: NormalizedKgNode) {
  return (
    row.name === node.name &&
    row.kind === node.kind &&
    (row.printed_page ?? null) === node.printedPage
  );
}

function sameEdge(row: typeof kg_edges.$inferSelect, edge: NormalizedKgEdge) {
  return (
    row.evidence === edge.evidence &&
    (row.printed_page ?? null) === edge.printedPage
  );
}

/** dryRun 用的只读预演：统计"会新建 / 会更新"多少，不写库 */
export async function previewKgImport(input: {
  chapter: string;
  schemaVersion: string;
  nodes: NormalizedKgNode[];
  edges: NormalizedKgEdge[];
}): Promise<KgImportPreview> {
  const [nodeRows, edgeRows] = await Promise.all([
    drizzleDb.select().from(kg_nodes).where(eq(kg_nodes.chapter, input.chapter)),
    drizzleDb.select().from(kg_edges).where(eq(kg_edges.chapter, input.chapter)),
  ]);
  const nodeMap = new Map(nodeRows.map((row) => [row.node_key, row]));
  const edgeMap = new Map(
    edgeRows.map((row) => [`${row.from_key}\u0000${row.to_key}\u0000${row.type}`, row]),
  );

  let wouldCreateNodes = 0;
  let wouldUpdateNodes = 0;
  for (const node of input.nodes) {
    const existing = nodeMap.get(node.nodeKey);
    if (!existing) wouldCreateNodes += 1;
    else if (!sameNode(existing, node)) wouldUpdateNodes += 1;
  }

  let wouldCreateEdges = 0;
  let wouldUpdateEdges = 0;
  for (const edge of input.edges) {
    const existing = edgeMap.get(`${edge.from}\u0000${edge.to}\u0000${edge.type}`);
    if (!existing) wouldCreateEdges += 1;
    else if (!sameEdge(existing, edge)) wouldUpdateEdges += 1;
  }

  return {
    wouldCreateNodes,
    wouldCreateEdges,
    wouldUpdateNodes,
    wouldUpdateEdges,
  };
}

/**
 * 真导入：单事务内 upsert。
 *
 * 计数口径（幂等语义）：同一份数据重复导入时 `skipped` 等于全部 ——
 * 内容一致算 skipped，内容变了才算 updated（例如补了 evidence / 页码）。
 */
export async function applyKgImport(input: {
  chapter: string;
  schemaVersion: string;
  nodes: NormalizedKgNode[];
  edges: NormalizedKgEdge[];
}): Promise<KgImportOutcome> {
  const outcome: KgImportOutcome = {
    created: { nodes: 0, edges: 0 },
    updated: { nodes: 0, edges: 0 },
    skipped: { nodes: 0, edges: 0 },
  };

  await drizzleDb.transaction(async (tx) => {
    const nodeRows = await tx
      .select()
      .from(kg_nodes)
      .where(eq(kg_nodes.chapter, input.chapter));
    const nodeMap = new Map(nodeRows.map((row) => [row.node_key, row]));

    for (const node of input.nodes) {
      const existing = nodeMap.get(node.nodeKey);
      if (!existing) {
        await tx.insert(kg_nodes).values({
          chapter: input.chapter,
          node_key: node.nodeKey,
          name: node.name,
          kind: node.kind as KgNodeKind,
          printed_page: node.printedPage,
        });
        outcome.created.nodes += 1;
      } else if (!sameNode(existing, node)) {
        await tx
          .update(kg_nodes)
          .set({
            name: node.name,
            kind: node.kind as KgNodeKind,
            printed_page: node.printedPage,
          })
          .where(
            and(
              eq(kg_nodes.chapter, input.chapter),
              eq(kg_nodes.node_key, node.nodeKey),
            ),
          );
        outcome.updated.nodes += 1;
      } else {
        outcome.skipped.nodes += 1;
      }
    }

    const edgeRows = await tx
      .select()
      .from(kg_edges)
      .where(eq(kg_edges.chapter, input.chapter));
    const edgeMap = new Map(
      edgeRows.map((row) => [
        `${row.from_key}\u0000${row.to_key}\u0000${row.type}`,
        row,
      ]),
    );

    for (const edge of input.edges) {
      const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
      const existing = edgeMap.get(key);
      if (!existing) {
        await tx.insert(kg_edges).values({
          chapter: input.chapter,
          from_key: edge.from,
          to_key: edge.to,
          type: edge.type,
          evidence: edge.evidence,
          printed_page: edge.printedPage,
          schema_version: input.schemaVersion,
        });
        outcome.created.edges += 1;
      } else if (!sameEdge(existing, edge)) {
        await tx
          .update(kg_edges)
          .set({
            evidence: edge.evidence,
            printed_page: edge.printedPage,
            schema_version: input.schemaVersion,
          })
          .where(
            and(
              eq(kg_edges.chapter, input.chapter),
              eq(kg_edges.from_key, edge.from),
              eq(kg_edges.to_key, edge.to),
              eq(kg_edges.type, edge.type),
            ),
          );
        outcome.updated.edges += 1;
      } else {
        outcome.skipped.edges += 1;
      }
    }
  });

  return outcome;
}

/** 章节地图：节点 + 边（边含 evidence 原句） */
export async function getKgGraph(chapter: string) {
  const [nodes, edges] = await Promise.all([
    drizzleDb
      .select({
        nodeKey: kg_nodes.node_key,
        name: kg_nodes.name,
        kind: kg_nodes.kind,
        printedPage: kg_nodes.printed_page,
      })
      .from(kg_nodes)
      .where(eq(kg_nodes.chapter, chapter))
      .orderBy(asc(kg_nodes.node_key)),
    drizzleDb
      .select({
        from: kg_edges.from_key,
        to: kg_edges.to_key,
        type: kg_edges.type,
        evidence: kg_edges.evidence,
        printedPage: kg_edges.printed_page,
      })
      .from(kg_edges)
      .where(eq(kg_edges.chapter, chapter))
      .orderBy(asc(kg_edges.from_key), asc(kg_edges.type)),
  ]);
  return { nodes, edges };
}

/** 平铺节点列表（`GET /api/kg/nodes`，支持 kind 过滤与分页） */
export async function listKgNodes(options: {
  chapter: string;
  kind?: string;
  limit: number;
  offset: number;
}) {
  const where = options.kind
    ? and(
        eq(kg_nodes.chapter, options.chapter),
        eq(kg_nodes.kind, options.kind as KgNodeKind),
      )
    : eq(kg_nodes.chapter, options.chapter);

  const [countRow, rows] = await Promise.all([
    drizzleDb
      .select({ value: sql<number>`COUNT(*)` })
      .from(kg_nodes)
      .where(where)
      .get(),
    drizzleDb
      .select({
        nodeKey: kg_nodes.node_key,
        name: kg_nodes.name,
        kind: kg_nodes.kind,
        printedPage: kg_nodes.printed_page,
      })
      .from(kg_nodes)
      .where(where)
      .orderBy(asc(kg_nodes.node_key))
      .limit(options.limit)
      .offset(options.offset)
      .all(),
  ]);

  return { items: rows, total: Number(countRow?.value) || 0 };
}

export interface QuestionNodeInput {
  questionId: number;
  chapter: string;
  nodeKey: string;
  method?: string | null;
  score?: number | null;
}

/**
 * 批量写题→节点（离线映射器回传，产品不做匹配算法）。
 *
 * 调用方（路由）已保证 question / node 存在且归属合法；这里只做幂等写入：
 * `(question_id, node_key)` 命中即跳过，返回 created/skipped。
 */
export async function attachQuestionNodes(items: QuestionNodeInput[]): Promise<{
  created: number;
  skipped: number;
}> {
  let created = 0;
  let skipped = 0;

  await drizzleDb.transaction(async (tx) => {
    for (const item of items) {
      const inserted = await tx
        .insert(question_nodes)
        .values({
          question_id: item.questionId,
          chapter: item.chapter,
          node_key: item.nodeKey,
          method: item.method ?? null,
          score: item.score ?? null,
        })
        .onConflictDoNothing({
          target: [question_nodes.question_id, question_nodes.node_key],
        })
        .returning({ questionId: question_nodes.question_id });
      if (inserted.length > 0) created += 1;
      else skipped += 1;
    }
  });

  return { created, skipped };
}

/** 本次映射引用的节点里，库里不存在的 key（用于 400 报错） */
export async function findMissingKgNodeKeys(
  chapter: string,
  nodeKeys: string[],
): Promise<string[]> {
  if (nodeKeys.length === 0) return [];
  const rows = await drizzleDb
    .select({ nodeKey: kg_nodes.node_key })
    .from(kg_nodes)
    .where(
      and(eq(kg_nodes.chapter, chapter), inArray(kg_nodes.node_key, nodeKeys)),
    );
  const present = new Set(rows.map((row) => row.nodeKey));
  return nodeKeys.filter((key) => !present.has(key));
}

/**
 * 题目归属检查：返回"当前用户不可写的题目 id"。
 *
 * 题库题（origin=import）全局可写；Agent 题集题（origin=agent）属于创建者，
 * 别的用户的 key 不能把它的作答映射到节点上（否则错题归因会串用户）。
 */
export async function findForbiddenQuestionIds(
  userId: number,
  questionIds: number[],
): Promise<number[]> {
  if (questionIds.length === 0) return [];
  const rows = await drizzleDb
    .select({
      id: questions.id,
      origin: questions.origin,
      ownerId: agent_question_sets.user_id,
    })
    .from(questions)
    .leftJoin(
      agent_question_sets,
      eq(questions.agent_set_id, agent_question_sets.id),
    )
    .where(inArray(questions.id, questionIds))
    .all();

  const allowed = new Set<number>();
  for (const row of rows) {
    if (row.origin === "flagged") continue;
    if (row.origin === "agent" && row.ownerId !== userId) continue;
    allowed.add(row.id);
  }
  return questionIds.filter((id) => !allowed.has(id));
}

export interface NodeMasteryItem {
  nodeKey: string;
  name: string;
  answered: number;
  correctRate: number;
}

/**
 * 节点级掌握度：直接聚合 `practice_logs`（不读 `user_mastery`）。
 *
 * 口径（与 tag 掌握度的差异，写进 docs 也算契约）：
 * - 分母 = 该节点下 `status != 'skipped'` 的作答条数（同一道题挂多个节点，
 *   会在每个节点各计一次；tag 口径按"题×标签"经 user_mastery 累计）；
 * - 分子 = `is_correct = 1` 的条数；`origin=flagged` 的题不计；
 * - 列出章内全部节点（answered=0 也给），供地图/薄弱点视图直接消费。
 */
export async function getNodeMastery(
  userId: number,
  chapter: string,
  options: { limit: number; offset: number },
): Promise<{ items: NodeMasteryItem[]; total: number }> {
  const [countRow, rows] = await Promise.all([
    drizzleDb
      .select({ value: sql<number>`COUNT(*)` })
      .from(kg_nodes)
      .where(eq(kg_nodes.chapter, chapter))
      .get(),
    drizzleDb
      .select({
        nodeKey: kg_nodes.node_key,
        name: kg_nodes.name,
        answered: sql<number>`COUNT(${practice_logs.id})`,
        correct: sql<number>`COALESCE(SUM(CASE WHEN ${practice_logs.is_correct} = 1 THEN 1 ELSE 0 END), 0)`,
      })
      .from(kg_nodes)
      .leftJoin(
        question_nodes,
        and(
          eq(question_nodes.node_key, kg_nodes.node_key),
          eq(question_nodes.chapter, kg_nodes.chapter),
        ),
      )
      .leftJoin(
        practice_logs,
        and(
          eq(practice_logs.question_id, question_nodes.question_id),
          eq(practice_logs.user_id, userId),
          ne(practice_logs.status, "skipped"),
          sql`${practice_logs.question_id} NOT IN (SELECT id FROM questions WHERE origin = 'flagged')`,
        ),
      )
      .where(eq(kg_nodes.chapter, chapter))
      .groupBy(kg_nodes.node_key, kg_nodes.name)
      .orderBy(desc(sql`COUNT(${practice_logs.id})`), asc(kg_nodes.node_key))
      .limit(options.limit)
      .offset(options.offset)
      .all(),
  ]);

  return {
    items: rows.map((row) => {
      const answered = Number(row.answered) || 0;
      const correct = Number(row.correct) || 0;
      return {
        nodeKey: row.nodeKey,
        name: row.name,
        answered,
        correctRate: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      };
    }),
    total: Number(countRow?.value) || 0,
  };
}

/** 导入结果里复用的覆盖率形状（导出给路由做类型标注） */
export type { KgCoverage };
