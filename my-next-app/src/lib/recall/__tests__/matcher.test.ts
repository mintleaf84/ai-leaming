// @vitest-environment node
/**
 * 匹配器（规格 §2.1 与 P1 裁决）：关键词任一命中、空关键词退化、cloze 段数不足、
 * cloze 双向包含但单字不算。
 *
 * 匹配器是纯函数，这里用真实卡片形状（与卡组文件同构）直接喂，不碰数据库。
 */
import { describe, it, expect } from "vitest";
import { gradeCloze, gradeList, splitClozeSegments } from "../matcher";
import type { RecallClozeCard, RecallListCard } from "../types";

function listCard(overrides: Partial<RecallListCard> = {}): RecallListCard {
  return {
    cardId: "L1-c03",
    kind: "list",
    prompt: "写出《教育法》中学校对学生负安全责任的主要情形",
    items: [
      { text: "建立安全制度和应急机制", keywords: ["安全制度", "应急机制"] },
      { text: "开展安全演练", keywords: ["安全演练"] },
      { text: "及时救助受伤学生", keywords: ["救助", "及时救治"] },
    ],
    verbatim: false,
    ...overrides,
  };
}

function clozeCard(overrides: Partial<RecallClozeCard> = {}): RecallClozeCard {
  return {
    cardId: "L1-c07",
    kind: "cloze",
    prompt: "学校不得使未成年学生在【　】的校舍中活动。",
    blanks: [
      { answers: ["危及人身安全、健康", "危及人身安全", "危及安全"] },
      { answers: ["教育教学设施"] },
    ],
    ...overrides,
  };
}

describe("gradeList", () => {
  it("关键词任一命中即判已写，并记录 keywordHits/keywordTotal", () => {
    const result = gradeList(
      listCard(),
      "1. 建立安全制度 2. 开展安全演练 3. 没写出来",
    );

    expect(result.verdicts).toEqual(["ok", "ok", "miss"]);
    expect(result.itemIndexes).toEqual([0, 1, 2]);
    expect(result.matchedItems).toEqual([0, 1]);
    expect(result.keywordHits).toBe(2);
    expect(result.keywordTotal).toBe(3);
  });

  it("只命中同义词里的第一个也算（任一命中）", () => {
    const result = gradeList(listCard(), "及时救治了学生");
    expect(result.verdicts).toEqual(["miss", "miss", "ok"]);
  });

  it("全角/标点/大小写不影响命中", () => {
    const result = gradeList(listCard(), "Ａ.安全制度；Ｂ.安全演练；Ｃ.救助");
    expect(result.verdicts).toEqual(["ok", "ok", "ok"]);
  });

  it("空 keywords 退化为「条目文本是否被包含」", () => {
    const card = listCard({
      items: [{ text: "建立安全制度", keywords: [] }],
    });
    expect(gradeList(card, "我先写了建立安全制度这条").verdicts).toEqual([
      "ok",
    ]);
    expect(gradeList(card, "完全无关").verdicts).toEqual(["miss"]);
  });

  it('归一化后为空的关键词被跳过（不能让 includes("") 蒙对）', () => {
    const card = listCard({ items: [{ text: "某条", keywords: ["、"] }] });
    expect(gradeList(card, "什么也没写").verdicts).toEqual(["miss"]);
  });

  it("空作答全判 miss（不能因空串子串匹配而全 ok）", () => {
    expect(gradeList(listCard(), "").verdicts).toEqual([
      "miss",
      "miss",
      "miss",
    ]);
  });

  it("只判指定下标（重测：UI 只呈现 pendingItems）", () => {
    const result = gradeList(listCard(), "安全演练", { itemIndexes: [1, 2] });
    expect(result.itemIndexes).toEqual([1, 2]);
    expect(result.verdicts).toEqual(["ok", "miss"]);
    expect(result.keywordHits).toBe(1);
    expect(result.keywordTotal).toBe(2);
    expect(result.matchedItems).toEqual([1]);
  });

  it("下标越界显式报错（静默跳过会让整卡被判 Good）", () => {
    expect(() =>
      gradeList(listCard(), "安全制度", { itemIndexes: [9] }),
    ).toThrow(/不存在条目下标 9/);
  });

  describe("关键词里的空白：两侧去全部空白后比对", () => {
    // 关键词是内容侧手写的（「倒 U 形」带空格），用户不会照着空格打；
    // 但 normalizeText 保留单个空格，所以关键词侧要再压一次。
    function card(keywords: string[]): RecallListCard {
      return listCard({
        items: [{ text: "动机水平与行为效率呈倒 U 形曲线", keywords }],
      });
    }

    it("关键词「倒 U 形」+ 作答「倒U形」→ ok", () => {
      expect(
        gradeList(card(["倒 U 形"]), "动机与效率呈倒U形").verdicts,
      ).toEqual(["ok"]);
    });

    it("作答写成全角「倒Ｕ形」也 ok（全角先归一再压空白）", () => {
      expect(gradeList(card(["倒 U 形"]), "呈倒Ｕ形曲线").verdicts).toEqual([
        "ok",
      ]);
    });

    it("不放松包含关系：关键词「图书资料」+ 作答「图书」→ miss", () => {
      expect(
        gradeList(
          listCard({
            items: [{ text: "使用图书资料", keywords: ["图书资料"] }],
          }),
          "图书",
        ).verdicts,
      ).toEqual(["miss"]);
    });
  });
});

describe("splitClozeSegments", () => {
  it("默认按空白/分号切", () => {
    expect(splitClozeSegments("危及人身安全 教育教学设施", 2)).toEqual([
      "危及人身安全",
      "教育教学设施",
    ]);
    expect(splitClozeSegments("危及人身安全；教育教学设施", 2)).toEqual([
      "危及人身安全",
      "教育教学设施",
    ]);
  });

  it("支持 | 与换行显式分隔", () => {
    expect(splitClozeSegments("危及人身安全|教育教学设施", 2)).toEqual([
      "危及人身安全",
      "教育教学设施",
    ]);
    expect(splitClozeSegments("危及人身安全\n教育教学设施", 2)).toEqual([
      "危及人身安全",
      "教育教学设施",
    ]);
  });

  it("不按顿号/逗号切（答案本身带顿号）", () => {
    expect(splitClozeSegments("危及人身安全、健康", 1)).toEqual([
      "危及人身安全、健康",
    ]);
  });

  it("尾部多余分隔符产生的空段被丢弃", () => {
    expect(splitClozeSegments("危及人身安全|", 2)).toEqual(["危及人身安全"]);
  });
});

describe("gradeCloze", () => {
  it("精确匹配：三种可接受答案都算对", () => {
    expect(
      gradeCloze(clozeCard(), "危及人身安全、健康 教育教学设施").verdicts,
    ).toEqual(["ok", "ok"]);
    expect(gradeCloze(clozeCard(), "危及安全|教育教学设施").verdicts).toEqual([
      "ok",
      "ok",
    ]);
  });

  it("段数不足：缺的空判 miss", () => {
    expect(gradeCloze(clozeCard(), "危及人身安全").verdicts).toEqual([
      "ok",
      "miss",
    ]);
  });

  it("双向包含：答案包含输入（输入 ≥2 字）算对", () => {
    // "危及人身安全" 是答案 "危及人身安全、健康" 的子串
    expect(
      gradeCloze(clozeCard(), "危及人身安全|教育教学设施").verdicts,
    ).toEqual(["ok", "ok"]);
  });

  it("双向包含：输入包含答案也算对（用户多写了修饰语）", () => {
    const card = clozeCard({ blanks: [{ answers: ["安全制度"] }] });
    expect(gradeCloze(card, "学校的建立安全制度义务").verdicts).toEqual(["ok"]);
  });

  it("单字不算包含匹配（避免蒙对）", () => {
    const card = clozeCard({ blanks: [{ answers: ["安全"] }] });
    expect(gradeCloze(card, "安").verdicts).toEqual(["miss"]);
    // 两字及以上才走包含分支
    expect(gradeCloze(card, "安全").verdicts).toEqual(["ok"]);
  });

  it("空作答全判 miss", () => {
    expect(gradeCloze(clozeCard(), "").verdicts).toEqual(["miss", "miss"]);
  });

  it("全角答案同样能匹配", () => {
    const card = clozeCard({ blanks: [{ answers: ["ABC"] }] });
    expect(gradeCloze(card, "ａｂｃ").verdicts).toEqual(["ok"]);
  });
});
