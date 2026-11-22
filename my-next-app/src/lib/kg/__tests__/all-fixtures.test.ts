// @vitest-environment node
/**
 * 全量图谱 fixture 门禁：离线目录里的 25 章图谱同步进 fixtures/kg/ 后，
 * 每一份都必须能被服务的 import 校验器接受，且考点覆盖率 100%。
 *
 * 这里只复用真实产物，不造数据；任何一章红了都说明「离线能过、线上过不了」，
 * 必须先查清口径差异，不许通过放宽校验器或删 fixture 让它变绿。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  validateKgImport,
  type KgEdgeInput,
  type KgNodeInput,
  type KgSection,
} from "../validate";
import { RELATION_TYPES_VERSION } from "../relation-types";

const KG_DIR = path.resolve(process.cwd(), "../fixtures/kg");
const chapters = JSON.parse(
  fs.readFileSync(path.join(KG_DIR, "chapters.json"), "utf8"),
) as Record<string, { kaodian: Array<[string, string, number]>; end: number }>;

type Edge = {
  from: string;
  to: string;
  type: string;
  evidence: string;
  printed_page: number;
};

function load(chapterNo: number) {
  const name =
    chapterNo === 1 ? "ch1-edges-v3.json" : `ch${chapterNo}-edges-v1.json`;
  const raw = JSON.parse(fs.readFileSync(path.join(KG_DIR, name), "utf8")) as {
    chapter: string;
    schema_version: string;
    edges: Edge[];
  };
  const toc = chapters[String(chapterNo)];
  expect(toc, `chapters.json 缺少第 ${chapterNo} 章`).toBeDefined();
  const sections: KgSection[] = toc.kaodian.map(
    ([key, title, startPage], i) => ({
      key,
      title,
      startPage,
      endPage: i + 1 < toc.kaodian.length ? toc.kaodian[i + 1][2] - 1 : toc.end,
    }),
  );
  const names = new Set<string>();
  for (const e of raw.edges) {
    names.add(e.from);
    names.add(e.to);
  }
  const nodes: KgNodeInput[] = Array.from(names).map((name) => ({
    nodeKey: name,
    name,
    kind: name.includes("·") ? "facet" : "concept",
  }));
  return {
    input: {
      chapter: `ch${chapterNo}`,
      schemaVersion: RELATION_TYPES_VERSION,
      sections,
      nodes,
      edges: raw.edges.map((e) => ({ ...e })) as KgEdgeInput[],
    },
    raw,
  };
}

describe("25 章真实图谱 fixture", () => {
  it("fixtures/kg 里恰好有 25 份边表和一份考点目录", () => {
    const files = fs
      .readdirSync(KG_DIR)
      .filter((f) => /^ch\d+-edges-v\d+\.json$/.test(f));
    expect(files).toHaveLength(25);
    expect(Object.keys(chapters).sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 25 }, (_, i) => String(i + 1)),
    );
  });

  for (let c = 1; c <= 25; c++) {
    it(`ch${c}：校验器无硬失败、考点全覆盖`, () => {
      const { input, raw } = load(c);
      expect(raw.edges.length).toBeGreaterThan(0);
      const result = validateKgImport(input);
      expect(
        result.issues,
        `ch${c}: ${JSON.stringify(result.issues).slice(0, 500)}`,
      ).toEqual([]);
      expect(result.coverage.covered).toBe(input.sections.length);
      expect(result.coverage.total).toBe(input.sections.length);
    });
  }

  it("总边数与离线权威清单一致（2607 条）", () => {
    let total = 0;
    for (let c = 1; c <= 25; c++) total += load(c).raw.edges.length;
    expect(total).toBe(2607);
  });
});
