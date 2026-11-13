// @vitest-environment node
/**
 * 评分推导（规格 §2.2）：Again / Hard / Good 三档，**永不产生 Easy**。
 */
import { describe, it, expect } from "vitest";
import { deriveRating } from "../rating";
import type { RecallItemVerdict } from "../types";

const ALL: RecallItemVerdict[] = ["ok", "miss"];

describe("deriveRating", () => {
  it("全对 → good", () => {
    expect(deriveRating(["ok", "ok", "ok"])).toBe("good");
    expect(deriveRating(["ok"])).toBe("good");
  });

  it("有错但没点「全没想起」→ hard", () => {
    expect(deriveRating(["ok", "miss"])).toBe("hard");
    expect(deriveRating(["miss"])).toBe("hard");
    expect(deriveRating(["miss", "miss", "miss"])).toBe("hard");
  });

  it("点「全没想起」→ again（覆盖一切）", () => {
    expect(deriveRating(["ok", "ok"], true)).toBe("again");
    expect(deriveRating(["miss", "miss"], true)).toBe("again");
  });

  it("没有可判条目 → again（空集不能靠 vacuous truth 判成 good）", () => {
    expect(deriveRating([])).toBe("again");
    expect(deriveRating([], true)).toBe("again");
  });

  it("遍历全部组合：结果只能是 again/hard/good，Easy 永不出现在返回值里", () => {
    const seen = new Set<string>();
    for (let mask = 0; mask < 1 << 6; mask += 1) {
      const verdicts: RecallItemVerdict[] = [];
      for (let bit = 0; bit < 6; bit += 1) {
        verdicts.push(ALL[(mask >> bit) & 1]);
      }
      for (const allBlank of [false, true]) {
        const rating = deriveRating(verdicts, allBlank);
        seen.add(rating);
        expect(["again", "hard", "good"]).toContain(rating);
        expect(rating).not.toBe("easy");
      }
    }
    expect(seen).toEqual(new Set(["again", "hard", "good"]));
  });
});
