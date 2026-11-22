/**
 * 教综知识图谱：导入门禁（纯函数，可单测）。
 *
 * 这里的规则是离线 `kg_validate.py` + `kg_coverage.py` 的 TS 版本，
 * 产品导入接口在写库前必须全部通过（docs/kg-product-plan.md §5）：
 *
 * 硬失败（有任意一条 → 400，一条都不写）
 * - `schemaVersion` 必须等于 `RELATION_TYPES_VERSION`
 * - 节点：key/name 非空、key 章内不重复、kind 已登记
 * - 边：type 已登记、`evidence` 非空、`from != to`、`(from,to,type)` 不重复、
 *   两端节点都存在、prerequisite 不成环、facet 不作 prerequisite 端点
 * - 覆盖率：每个 section 至少命中 1 条边（按 `printed_page` 落区间）
 *
 * 告警（允许导入，响应里返回）
 * - 使用了 proposed 类型（未正式启用）
 * - 对称关系双向各写一条（建议只留一条）
 *
 * 纯函数：不做任何 IO，也不读 JSON 文件；类型定义来自 `relation-types.ts`。
 */
import {
  PROPOSED_RELATION_TYPES,
  RELATION_TYPES_VERSION,
  SYMMETRIC_RELATION_TYPES,
  isNodeKind,
  isProposedRelationType,
  isRegisteredRelationType,
} from "./relation-types";

export interface KgSection {
  key: string;
  title: string;
  startPage: number;
  endPage: number;
}

export interface KgNodeInput {
  nodeKey: string;
  name: string;
  kind: string;
  printedPage?: number | null;
}

export interface KgEdgeInput {
  from: string;
  to: string;
  type: string;
  evidence?: string;
  /** 离线管线字段名是 snake_case（fixtures/kg/ch1-edges-v3.json），原样接受 */
  printed_page?: number | null;
  note?: string;
}

export interface KgImportInput {
  chapter: string;
  schemaVersion: string;
  sections: KgSection[];
  nodes: KgNodeInput[];
  edges: KgEdgeInput[];
}

export interface NormalizedKgNode {
  nodeKey: string;
  name: string;
  kind: string;
  printedPage: number | null;
}

export interface NormalizedKgEdge {
  from: string;
  to: string;
  type: string;
  evidence: string;
  printedPage: number | null;
}

export interface KgValidationIssue {
  code: string;
  message: string;
}

export interface KgCoverage {
  covered: number;
  total: number;
  missing: KgSection[];
}

export interface KgValidationResult {
  issues: KgValidationIssue[];
  warnings: string[];
  coverage: KgCoverage;
  nodes: NormalizedKgNode[];
  edges: NormalizedKgEdge[];
}

/**
 * 节点 key 的唯一规范化入口。
 *
 * 离线产物里有两种写法：完整 key（`ch1:广义的教育`）与裸名称（`广义的教育`）。
 * 入库前一律补上 `<chapter>:` 前缀，保证 UNIQUE(chapter,node_key)、
 * 边端点引用与 `?node=` 过滤用的是同一串。
 */
export function normalizeNodeKey(chapter: string, raw: string): string {
  const key = raw.trim();
  if (!key) return key;
  return key.includes(":") ? key : `${chapter}:${key}`;
}

function toPage(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** 覆盖率：按 printed_page 落闭区间 [startPage, endPage] */
export function computeCoverage(
  sections: KgSection[],
  edges: NormalizedKgEdge[],
): KgCoverage {
  const missing = sections.filter(
    (section) =>
      !edges.some(
        (edge) =>
          edge.printedPage !== null &&
          edge.printedPage >= section.startPage &&
          edge.printedPage <= section.endPage,
      ),
  );
  return {
    covered: sections.length - missing.length,
    total: sections.length,
    missing,
  };
}

export function validateKgImport(input: KgImportInput): KgValidationResult {
  const issues: KgValidationIssue[] = [];
  const warnings: string[] = [];

  const chapter = (input.chapter ?? "").trim();
  if (!chapter) {
    issues.push({ code: "chapter_required", message: "chapter 不能为空" });
  }

  if (input.schemaVersion !== RELATION_TYPES_VERSION) {
    issues.push({
      code: "schema_version_mismatch",
      message: `schemaVersion 不匹配：收到 ${JSON.stringify(input.schemaVersion)}，当前登记表版本是 ${RELATION_TYPES_VERSION}（类型变更须走离线 schema 并重新导入）`,
    });
  }

  if (!input.sections || input.sections.length === 0) {
    issues.push({
      code: "sections_required",
      message:
        "必须提供 sections（考点清单）：覆盖率门禁靠它判断「有没有整节没建」，空清单等于关掉门禁",
    });
  }

  // ---------- 节点 ----------
  const nodes: NormalizedKgNode[] = [];
  const seenNodeKeys = new Set<string>();
  for (const [index, node] of (input.nodes ?? []).entries()) {
    const nodeKey = normalizeNodeKey(chapter, node.nodeKey ?? "");
    const tag = `nodes[${index}] ${nodeKey || "<空 key>"}`;
    if (!nodeKey) {
      issues.push({ code: "empty_node_key", message: `${tag}: nodeKey 为空` });
      continue;
    }
    if (!node.name || !node.name.trim()) {
      issues.push({ code: "empty_node_name", message: `${tag}: name 为空` });
    }
    if (!isNodeKind(node.kind)) {
      issues.push({
        code: "unknown_node_kind",
        message: `${tag}: 未登记的节点类型 ${JSON.stringify(node.kind)}`,
      });
    }
    if (seenNodeKeys.has(nodeKey)) {
      issues.push({
        code: "duplicate_node",
        message: `${tag}: 同一章内 node_key 重复`,
      });
      continue;
    }
    seenNodeKeys.add(nodeKey);
    nodes.push({
      nodeKey,
      name: (node.name ?? "").trim(),
      kind: node.kind,
      printedPage: toPage(node.printedPage ?? null),
    });
  }

  const facetKeys = new Set(
    nodes.filter((node) => node.kind === "facet").map((node) => node.nodeKey),
  );

  // ---------- 边 ----------
  const edges: NormalizedKgEdge[] = [];
  const seenEdges = new Set<string>();
  const prerequisiteGraph = new Map<string, Set<string>>();
  const symmetricPairs = new Set<string>();

  for (const [index, edge] of (input.edges ?? []).entries()) {
    const from = normalizeNodeKey(chapter, edge.from ?? "");
    const to = normalizeNodeKey(chapter, edge.to ?? "");
    const type = edge.type ?? "";
    const tag = `edges[${index}] ${from || "<空>"} -${type}-> ${to || "<空>"}`;

    if (!from || !to) {
      issues.push({
        code: "empty_endpoint",
        message: `${tag}: from/to 为空`,
      });
      continue;
    }
    if (from === to) {
      issues.push({ code: "self_loop", message: `${tag}: 自环` });
    }
    if (!isRegisteredRelationType(type)) {
      issues.push({
        code: "unknown_relation_type",
        message: `${tag}: 未登记的关系类型 ${JSON.stringify(type)}（登记表见 src/lib/kg/relation-types.ts）`,
      });
      continue;
    }
    if (isProposedRelationType(type)) {
      warnings.push(`${tag}: 使用了 proposed 类型（未正式启用）`);
    }
    const evidence = (edge.evidence ?? "").trim();
    if (!evidence) {
      issues.push({
        code: "missing_evidence",
        message: `${tag}: 缺 evidence（每条边必须挂教材原句）`,
      });
    }

    const dedupeKey = `${from}\u0000${type}\u0000${to}`;
    if (seenEdges.has(dedupeKey)) {
      issues.push({
        code: "duplicate_edge",
        message: `${tag}: 重复边（同 (from,to,type) 只能有一条）`,
      });
    }
    seenEdges.add(dedupeKey);

    if (!seenNodeKeys.has(from)) {
      issues.push({
        code: "unknown_endpoint",
        message: `${tag}: 起点 ${from} 不在本次 nodes 里`,
      });
    }
    if (!seenNodeKeys.has(to)) {
      issues.push({
        code: "unknown_endpoint",
        message: `${tag}: 终点 ${to} 不在本次 nodes 里`,
      });
    }

    if (type === "prerequisite") {
      const bucket = prerequisiteGraph.get(from) ?? new Set<string>();
      bucket.add(to);
      prerequisiteGraph.set(from, bucket);
      for (const endpoint of [from, to]) {
        if (facetKeys.has(endpoint)) {
          issues.push({
            code: "facet_prerequisite",
            message: `${tag}: facet 节点 ${endpoint} 不得作为 prerequisite 端点`,
          });
        }
      }
    }

    if (SYMMETRIC_RELATION_TYPES.includes(type)) {
      symmetricPairs.add(`${from}\u0000${type}\u0000${to}`);
    }

    edges.push({
      from,
      to,
      type,
      evidence,
      printedPage: toPage(edge.printed_page ?? null),
    });
  }

  // 对称关系双写只告警：按字典序只报一次
  for (const pair of symmetricPairs) {
    const [from, type, to] = pair.split("\u0000");
    if (from < to && symmetricPairs.has(`${to}\u0000${type}\u0000${from}`)) {
      warnings.push(
        `对称关系双向各写一条：${from} <-> ${to} (${type})，建议只留一条`,
      );
    }
  }

  // ---------- prerequisite 成环（DFS） ----------
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  const visit = (node: string, stack: string[]): void => {
    color.set(node, GRAY);
    for (const next of prerequisiteGraph.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        issues.push({
          code: "prerequisite_cycle",
          message: `prerequisite 成环：${[...stack, node, next].join(" → ")}`,
        });
      } else if ((color.get(next) ?? WHITE) === WHITE) {
        visit(next, [...stack, node]);
      }
    }
    color.set(node, BLACK);
  };

  for (const start of prerequisiteGraph.keys()) {
    if ((color.get(start) ?? WHITE) === WHITE) visit(start, []);
  }

  const coverage = computeCoverage(input.sections ?? [], edges);

  // 覆盖率是硬门禁：某个考点一条边都没有 = 这一块没建（曾漏掉考点四/五/六）。
  for (const section of coverage.missing) {
    issues.push({
      code: "uncovered_section",
      message: `未覆盖的考点 ${section.key} ${section.title}（p${section.startPage}-${section.endPage}）没有任何一条边`,
    });
  }

  return { issues, warnings, coverage, nodes, edges };
}

/** 便于读接口/测试引用：登记表里有多少条 proposed */
export const PROPOSED_TYPE_COUNT = PROPOSED_RELATION_TYPES.length;
