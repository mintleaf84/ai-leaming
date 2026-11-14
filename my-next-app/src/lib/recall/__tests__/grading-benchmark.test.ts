// @vitest-environment node
/**
 * 判分基准集对拍（规格 §6 验收 3）：20 份人工作答样本上，预勾算法与人工判定
 * 的**条目级**一致率 ≥90%。
 *
 * 数据流：内容仓 `fj-teacher-exam-physics/docs/recall/grading-benchmark.json`
 * （人工标注）→ 本仓副本 `fixtures/grading-benchmark.json`（带 `_source` +
 * `_source_md5`）→ 用本仓**真实**判分器 `gradeList` / `gradeCloze` 对拍。
 * 卡组同样走副本 `fixtures/fj-jiaozong-2027.deck.json`：不 import 内容仓绝对路径
 * （CI 上没有那个仓，跨仓引用只能靠副本）。
 *
 * 副本与源的漂移由内容仓 `tools/check_recall_benchmark.py` 校验（比 md5 + 逐字段内容）；
 * 本文件只保证「手上这一份副本自洽」。
 *
 * 三条断言各管一件事，别混：
 * 1. **一致率 ≥90%** —— 规格门槛。当前这条是红的（实测 89.19%，见内容仓
 *    `docs/recall/benchmark-report.md`），红本身就是这次验收要交的结论，
 *    不要靠改 `matcher.ts`、调阈值或删样本来变绿；
 * 2. **`KNOWN_GAPS` 与实测分歧集合完全一致** —— 棘轮：新增分歧必须显式写进来并
 *    附理由（防止有人悄悄把新分歧塞进白名单），修好后也必须删掉（防止白名单残留
 *    把回归藏起来）；
 * 3. **`human` 长度 = 卡片条目数/空位数** —— 防止 fixture 被手改坏后静默少判一条
 *    （少判一条会让一张卡更容易被判成 Good）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeCloze, gradeList } from "../matcher";
import type { RecallCard, RecallItemVerdict } from "../types";

/** 基准集里的单份人工作答 */
interface BenchmarkSample {
  id: string;
  cardId: string;
  kind: "list" | "cloze";
  typed: string;
  /** 人工判断，与卡片条目/空一一对应；**不是** matcher 输出 */
  human: RecallItemVerdict[];
  caseType: string;
  note: string;
}

interface BenchmarkFile {
  _source: string;
  _source_md5: string;
  schema: number;
  deckId: string;
  note: string;
  samples: BenchmarkSample[];
}

interface DeckFile {
  _source: string;
  _source_md5: string;
  deckId: string;
  cards: RecallCard[];
}

function readFixture<T>(name: string): T {
  const path = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const benchmark = readFixture<BenchmarkFile>("grading-benchmark.json");
const deck = readFixture<DeckFile>("fj-jiaozong-2027.deck.json");
const cardsById = new Map(deck.cards.map((card) => [card.cardId, card]));

/** 卡片要求的作答条数：列举卡=条目数，填空卡=空位数 */
function expectedVerdictCount(card: RecallCard): number {
  return card.kind === "list" ? card.items.length : card.blanks.length;
}

/** 跑真实判分器；列举卡传全部下标（整卡判定，不是重测的 pendingItems 子集） */
function runMatcher(
  card: RecallCard,
  sample: BenchmarkSample,
): RecallItemVerdict[] {
  if (card.kind === "list") {
    return gradeList(card, sample.typed, {
      itemIndexes: card.items.map((_, index) => index),
    }).verdicts;
  }
  return gradeCloze(card, sample.typed).verdicts;
}

interface SampleResult {
  sample: BenchmarkSample;
  card: RecallCard;
  algo: RecallItemVerdict[];
  /** 人工与 matcher 不一致的条目下标 */
  gapIndexes: number[];
}

const results: SampleResult[] = benchmark.samples.map((sample) => {
  const card = cardsById.get(sample.cardId);
  if (!card) {
    throw new Error(
      `样本 ${sample.id} 引用了卡组副本里不存在的 cardId ${sample.cardId}`,
    );
  }
  const algo = runMatcher(card, sample);
  const gapIndexes = sample.human
    .map((human, index) => (human === algo[index] ? -1 : index))
    .filter((index) => index >= 0);
  return { sample, card, algo, gapIndexes };
});

const totalItems = results.reduce(
  (sum, row) => sum + row.sample.human.length,
  0,
);
const agreedItems = results.reduce(
  (sum, row) => sum + (row.sample.human.length - row.gapIndexes.length),
  0,
);
const agreementRate = totalItems === 0 ? 0 : agreedItems / totalItems;

// 误杀 = 人工判已写、算法判未写；假阳 = 人工判未写、算法判已写
const misKills = results.flatMap((row) =>
  row.gapIndexes.filter((index) => row.sample.human[index] === "ok"),
);
const falsePositives = results.flatMap((row) =>
  row.gapIndexes.filter((index) => row.sample.human[index] === "miss"),
);

/**
 * 棘轮白名单：**当前实测**的全部分歧，逐条附人工理由。
 * 多一个少一个都必须红 —— 要么是回归（新增误判），要么是已修好却忘了删。
 * 规则建议与是否该改 matcher 的结论见内容仓 `docs/recall/benchmark-report.md`。
 */
const KNOWN_GAPS: Array<{ sampleId: string; index: number; reason: string }> = [
  {
    sampleId: "B03",
    index: 0,
    reason:
      "「参加学校安排的教学活动 + 使用场地设备和资料」是同义改写，关键词逐字要求导致误杀",
  },
  {
    sampleId: "B05",
    index: 1,
    reason: "「活动交往 / 各方面」与关键词「活动和交往 / 多方面」差连词，误杀",
  },
  {
    sampleId: "B06",
    index: 3,
    reason: "「唯论问」是「唯论文」的输入法错字，归一化不做拼音/形近容错，误杀",
  },
  {
    sampleId: "B07",
    index: 3,
    reason: "两层条目只写了「学籍管理」，任一关键词命中即判绿，假阳",
  },
  {
    sampleId: "B15",
    index: 0,
    reason: "「说服法」是「说服教育法」的通行简称，关键词要求四字连写，误杀",
  },
];

describe("判分基准集（规格 §6 验收 3）", () => {
  it("fixture 引自内容仓，且带 md5 便于发现漂移", () => {
    expect(benchmark._source).toBe("docs/recall/grading-benchmark.json");
    expect(benchmark._source_md5).toMatch(/^[0-9a-f]{32}$/);
    expect(deck._source).toBe("docs/recall/fj-jiaozong-2027.deck.json");
    expect(deck._source_md5).toMatch(/^[0-9a-f]{32}$/);
    expect(benchmark.deckId).toBe(deck.deckId);
  });

  it("20 份样本、列举 15 + 填空 5（规格 §6 #3 的样本量）", () => {
    expect(benchmark.samples).toHaveLength(20);
    const lists = benchmark.samples.filter((sample) => sample.kind === "list");
    expect(lists).toHaveLength(15);
    expect(benchmark.samples.length - lists.length).toBe(5);
    const ids = new Set(benchmark.samples.map((sample) => sample.id));
    expect(ids.size).toBe(benchmark.samples.length);
  });

  it("human 长度 = 卡片条目数 / 空位数（防止 fixture 手改坏）", () => {
    for (const { sample, card } of results) {
      expect(sample.human.length, `${sample.id} (${sample.cardId})`).toBe(
        expectedVerdictCount(card),
      );
      expect(sample.kind, `${sample.id} kind 与卡片类型不一致`).toBe(card.kind);
    }
  });

  it("条目级一致率 ≥90%（规格门槛）", () => {
    const gapList = results
      .flatMap((row) =>
        row.gapIndexes.map(
          (index) =>
            `${row.sample.id}#${index}(人工${row.sample.human[index]}/算法${row.algo[index]})`,
        ),
      )
      .join("、");
    const detail =
      `${agreedItems}/${totalItems} = ${(agreementRate * 100).toFixed(2)}%；` +
      `误杀 ${misKills.length} 条、假阳 ${falsePositives.length} 条；` +
      `分歧：${gapList}；详见内容仓 docs/recall/benchmark-report.md`;
    expect(agreementRate, detail).toBeGreaterThanOrEqual(0.9);
  });

  it("KNOWN_GAPS 与实测分歧集合完全一致（棘轮：多一个少一个都红）", () => {
    const measured = results
      .flatMap((row) =>
        row.gapIndexes.map((index) => ({ sampleId: row.sample.id, index })),
      )
      .sort(
        (a, b) => a.sampleId.localeCompare(b.sampleId) || a.index - b.index,
      );

    const declared = KNOWN_GAPS.map(({ sampleId, index }) => ({
      sampleId,
      index,
    })).sort(
      (a, b) => a.sampleId.localeCompare(b.sampleId) || a.index - b.index,
    );

    expect(declared).toEqual(measured);
  });
});
