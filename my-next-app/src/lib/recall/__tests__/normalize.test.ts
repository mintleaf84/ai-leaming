// @vitest-environment node
/**
 * 归一化（规格 §2.1）：全角转半角、去中英文标点、折叠空白。
 *
 * 这里刻意把"不做什么"也测出来（不做拼音、不做繁简、不删符号类字符），
 * 因为这三条是产品决定，不是实现细节——后续有人"顺手加一个同义词表"时，
 * 这些断言会提醒他先看一下 types.ts 的边界说明。
 */
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  stripPunctuation,
  toHalfWidth,
} from "../normalize";

describe("toHalfWidth", () => {
  it("全角 ASCII → 半角", () => {
    expect(toHalfWidth("ＡＢＣ１２３")).toBe("ABC123");
    expect(toHalfWidth("（）！？")).toBe("()!?");
  });

  it("全角空格 → 普通空格", () => {
    expect(toHalfWidth("安全\u3000制度")).toBe("安全 制度");
  });

  it("中文与代理对字符原样保留（不按 UTF-16 单元切断）", () => {
    expect(toHalfWidth("安全🚀制度")).toBe("安全🚀制度");
  });
});

describe("stripPunctuation", () => {
  it("中英文标点都去掉", () => {
    expect(stripPunctuation("安全制度、应急机制。")).toBe("安全制度应急机制");
    expect(stripPunctuation("hello, world!")).toBe("hello world");
    expect(stripPunctuation("《教育法》第五十三条")).toBe("教育法第五十三条");
  });

  it("符号类字符不删（+ = ° 是语义的一部分）", () => {
    expect(stripPunctuation("A+B=90°")).toBe("A+B=90°");
  });
});

describe("normalizeText", () => {
  it("全角字母 → 小写半角", () => {
    expect(normalizeText("ＡＢＣ")).toBe("abc");
  });

  it("中文标点与多余空白一起处理", () => {
    expect(normalizeText("  建立安全制度 ，  和应急机制。 ")).toBe(
      "建立安全制度 和应急机制",
    );
  });

  it("连续空白折叠成一个空格（不是全删：单空格仍参与匹配）", () => {
    expect(normalizeText("安全\t\n  制度")).toBe("安全 制度");
  });

  it("空串/纯空白/纯标点 → 空串", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   \u3000 ")).toBe("");
    expect(normalizeText("、，。！？")).toBe("");
  });

  it("不做繁简转换（这是产品决定，不是遗漏）", () => {
    expect(normalizeText("學習")).toBe("學習");
    expect(normalizeText("学习")).toBe("学习");
  });

  it("幂等（归一化两次与一次相同）", () => {
    const once = normalizeText("  《教育法》 ，ＡＢＣ！ ");
    expect(normalizeText(once)).toBe(once);
  });
});
