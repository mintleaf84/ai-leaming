// @vitest-environment node
/**
 * 图谱导入门禁（纯函数）：直接把离线 `kg_validate.py` + `kg_coverage.py` 的
 * 五类硬失败与覆盖率口径钉死在单测里。
 *
 * 第一组用真实的第一章产物（`fixtures/kg/ch1-edges-v3.json`，153 边 / 166 节点）
 * 证明"合法数据过得去"；其余用例逐条制造坏数据，证明"图上歪了进不来"。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeCoverage,
  normalizeNodeKey,
  validateKgImport,
  type KgEdgeInput,
  type KgNodeInput,
  type KgSection,
} from "../validate";
import { RELATION_TYPES_VERSION } from "../relation-types";

const FIXTURE = path.resolve(process.cwd(), "../fixtures/kg/ch1-edges-v3.json");

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as {
  chapter: string;
  schema_version: string;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    evidence: string;
    printed_page: number;
  }>;
};

/** 目录页的 15 个考点（与 kg_coverage.py 的 CH1_KAODIAN 一致） */
const KAODIAN: Array<[string, string, number]> = [
  ["考点一", "教育的定义与要素", 3],
  ["考点二", "教育的形态及属性", 5],
  ["考点三", "教育的功能和起源", 7],
  ["考点四", "中国奴隶社会教育的发展历程", 11],
  ["考点五", "中国封建社会的教育发展历程", 12],
  ["考点六", "外国教育的发展历程", 15],
  ["考点七", "教育的总体特征", 18],
  ["考点八", "教育学的萌芽阶段 1- 孔子与孟子", 20],
  ["考点九", "教育学的萌芽阶段 2- 荀子、墨子与《学记》", 21],
  ["考点十", "教育学的萌芽阶段 3- 古希腊三贤", 22],
  ["考点十一", "教育学的创立阶段 1- 夸美纽斯", 23],
  ["考点十二", "教育学的创立阶段 2- 赫尔巴特", 24],
  ["考点十三", "教育学的创立阶段 3- 杜威、卢梭与裴斯泰洛齐", 26],
  ["考点十四", "教育学的发展阶段 - 蔡元培、陈鹤琴与陶行知", 28],
  ["考点十五", "现代教育学流派与当代教育发展", 30],
];

const SECTIONS: KgSection[] = KAODIAN.map(([key, title, startPage], i) => ({
  key,
  title,
  startPage,
  endPage: i + 1 < KAODIAN.length ? KAODIAN[i + 1][2] - 1 : 32,
}));

/** 从边端点还原节点清单（离线产物只存边；节点类型按命名习惯粗分） */
function fixtureNodes(): KgNodeInput[] {
  const names = new Set<string>();
  for (const edge of fixture.edges) {
    names.add(edge.from);
    names.add(edge.to);
  }
  return Array.from(names).map((name) => ({
    nodeKey: name,
    name,
    kind: name.includes("·") ? "facet" : "concept",
  }));
}

function fixtureEdges(): KgEdgeInput[] {
  return fixture.edges.map((edge) => ({ ...edge }));
}

function baseInput() {
  return {
    chapter: "ch1",
    schemaVersion: RELATION_TYPES_VERSION,
    sections: SECTIONS,
    nodes: fixtureNodes(),
    edges: fixtureEdges(),
  };
}

function codes(input: Parameters<typeof validateKgImport>[0]) {
  return validateKgImport(input).issues.map((issue) => issue.code);
}

describe("第一章真实产物（ch1-edges-v3.json）", () => {
  it("门禁通过：153 边 / 166 节点，覆盖率 15/15，proposed 类型只告警", () => {
    const result = validateKgImport(baseInput());

    expect(result.issues).toEqual([]);
    expect(result.edges).toHaveLength(153);
    expect(result.nodes).toHaveLength(166);
    expect(result.coverage).toMatchObject({
      covered: 15,
      total: 15,
      missing: [],
    });
    // attribute / contrast / chronology / represented_by 共 34 条 → 只进 warnings
    expect(result.warnings.length).toBe(34);
    expect(result.warnings.every((w) => w.includes("proposed"))).toBe(true);
  });

  it("节点 key 规范化为 `<chapter>:<名称>`，与 ?node= 的串一致", () => {
    const result = validateKgImport(baseInput());
    const keys = result.nodes.map((n) => n.nodeKey);
    expect(keys).toContain("ch1:教育学的创立阶段");
    expect(result.edges[0]).toMatchObject({
      from: `ch1:${fixture.edges[0].from}`,
      to: `ch1:${fixture.edges[0].to}`,
    });
  });
});

describe("硬失败：一条不合格整章不写", () => {
  it("缺 evidence", () => {
    const input = baseInput();
    input.edges[0] = { ...input.edges[0], evidence: "   " };
    const result = validateKgImport(input);
    expect(codes(input)).toContain("missing_evidence");
    expect(result.issues[0].message).toContain("edges[0]");
  });

  it("未登记的关系类型", () => {
    const input = baseInput();
    input.edges[0] = { ...input.edges[0], type: "made_up_type" };
    expect(codes(input)).toContain("unknown_relation_type");
  });

  it("自环", () => {
    const input = baseInput();
    input.edges[0] = {
      ...input.edges[0],
      to: input.edges[0].from,
    };
    expect(codes(input)).toContain("self_loop");
  });

  it("同 (from,to,type) 重复", () => {
    const input = baseInput();
    input.edges = [input.edges[0], { ...input.edges[0] }];
    expect(codes(input)).toContain("duplicate_edge");
  });

  it("prerequisite 成环", () => {
    const nodes: KgNodeInput[] = [
      { nodeKey: "贯穿", name: "贯穿", kind: "concept" },
      { nodeKey: "贯通", name: "贯通", kind: "concept" },
    ];
    const result = validateKgImport({
      chapter: "ch9",
      schemaVersion: RELATION_TYPES_VERSION,
      sections: [{ key: "考点一", title: "测试", startPage: 1, endPage: 10 }],
      nodes,
      edges: [
        {
          from: "贯穿",
          to: "贯通",
          type: "prerequisite",
          evidence: "原句 A",
          printed_page: 1,
        },
        {
          from: "贯通",
          to: "贯穿",
          type: "prerequisite",
          evidence: "原句 B",
          printed_page: 1,
        },
      ],
    });
    expect(result.issues.map((i) => i.code)).toContain("prerequisite_cycle");
  });

  it("facet 节点作为 prerequisite 端点", () => {
    const result = validateKgImport({
      chapter: "ch9",
      schemaVersion: RELATION_TYPES_VERSION,
      sections: [{ key: "考点一", title: "测试", startPage: 1, endPage: 10 }],
      nodes: [
        { nodeKey: "形态·按空间划分", name: "形态·按空间划分", kind: "facet" },
        { nodeKey: "教育的形态", name: "教育的形态", kind: "concept" },
      ],
      edges: [
        {
          from: "形态·按空间划分",
          to: "教育的形态",
          type: "prerequisite",
          evidence: "原句",
          printed_page: 1,
        },
      ],
    });
    expect(result.issues.map((i) => i.code)).toContain("facet_prerequisite");
  });

  it("schemaVersion 不匹配", () => {
    const input = { ...baseInput(), schemaVersion: "1.0" };
    expect(codes(input)).toContain("schema_version_mismatch");
  });

  it("某个 section 一条边都没有 → missing 列出该考点", () => {
    const input = baseInput();
    // 删掉所有落在 考点十五（p30-32）的边
    input.edges = input.edges.filter(
      (edge) =>
        !((edge.printed_page ?? 0) >= 30 && (edge.printed_page ?? 0) <= 32),
    );
    const result = validateKgImport(input);
    expect(result.issues.map((i) => i.code)).toEqual(["uncovered_section"]);
    expect(result.coverage.covered).toBe(14);
    expect(result.coverage.missing.map((s) => s.key)).toEqual(["考点十五"]);
  });

  it("空 sections 等于关掉覆盖率门禁 → 直接拒绝", () => {
    const input = { ...baseInput(), sections: [] };
    expect(codes(input)).toContain("sections_required");
  });

  it("边端点不在本次 nodes 里", () => {
    const input = baseInput();
    input.nodes = input.nodes.filter(
      (node) => node.nodeKey !== fixture.edges[0].from,
    );
    expect(codes(input)).toContain("unknown_endpoint");
  });

  it("节点完整 key 的章前缀与 chapter 不一致 → 拒绝（否则 ch1:A 与 ch2:A 并存）", () => {
    const input = baseInput();
    input.nodes.push({ nodeKey: "ch2:跨章节点", name: "跨章节点", kind: "concept" });
    input.edges = [
      {
        from: "ch2:跨章节点",
        to: fixture.edges[0].to,
        type: "subclass",
        evidence: "原句",
        printed_page: 3,
      },
    ];
    const result = validateKgImport(input);
    expect(result.issues.map((i) => i.code)).toContain(
      "node_key_chapter_mismatch",
    );
    expect(result.issues.map((i) => i.message).join("\n")).toContain("ch2:跨章节点");
    // 跨章节点/边不进入规范化结果，避免被后续逻辑当作本章数据
    expect(result.nodes.map((n) => n.nodeKey)).not.toContain("ch2:跨章节点");
    expect(result.edges).toHaveLength(0);
  });
});

describe("覆盖率计算", () => {
  it("按闭区间统计，边界页计入", () => {
    const coverage = computeCoverage(
      [{ key: "A", title: "A", startPage: 3, endPage: 5 }],
      [
        {
          from: "ch1:a",
          to: "ch1:b",
          type: "subclass",
          evidence: "原句",
          printedPage: 5,
        },
      ],
    );
    expect(coverage).toMatchObject({ covered: 1, total: 1 });
  });

  it("没有页码的边不能算覆盖", () => {
    const coverage = computeCoverage(
      [{ key: "A", title: "A", startPage: 3, endPage: 5 }],
      [
        {
          from: "ch1:a",
          to: "ch1:b",
          type: "subclass",
          evidence: "原句",
          printedPage: null,
        },
      ],
    );
    expect(coverage.missing).toHaveLength(1);
  });
});

describe("normalizeNodeKey", () => {
  it("裸名称补章前缀，完整 key 原样保留并 trim", () => {
    expect(normalizeNodeKey("ch1", "广义的教育")).toBe("ch1:广义的教育");
    expect(normalizeNodeKey("ch1", " ch1:广义的教育 ")).toBe("ch1:广义的教育");
    expect(normalizeNodeKey("ch1", "  ")).toBe("");
  });
});
