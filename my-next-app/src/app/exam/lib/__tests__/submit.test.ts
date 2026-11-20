import { describe, expect, it } from "vitest";
import {
  createClientKey,
  createSubmitGate,
  submitConfirmMessage,
} from "../submit";

describe("submitConfirmMessage", () => {
  it("有未作答题时必须二次确认，并念出数量", () => {
    expect(submitConfirmMessage(3, 20)).toContain("还有 3 题没作答");
    expect(submitConfirmMessage(3, 20)).toContain("共 20 题");
  });

  it("全部作答后直接交卷，不再弹确认", () => {
    expect(submitConfirmMessage(0, 20)).toBeNull();
  });
});

describe("createSubmitGate", () => {
  it("同一份作答只放行一次", () => {
    const gate = createSubmitGate();
    expect(gate.started).toBe(false);
    expect(gate.tryStart()).toBe(true);
    expect(gate.started).toBe(true);
    // 倒计时自动交卷与用户手点撞在一起时，第二次必须被挡掉
    expect(gate.tryStart()).toBe(false);
  });

  it("失败后 reset 可以重试", () => {
    const gate = createSubmitGate();
    gate.tryStart();
    gate.reset();
    expect(gate.tryStart()).toBe(true);
  });
});

describe("createClientKey", () => {
  it("每次生成都不一样（重试时由调用方保持不变）", () => {
    const first = createClientKey();
    const second = createClientKey();
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });
});
