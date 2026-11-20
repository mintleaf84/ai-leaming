/**
 * 交卷的两条判定：要不要二次确认、以及"只交一次"的闸门。
 *
 * 闸门存在的原因（契约 §5）：倒计时归零会自动交卷，用户同时点"交卷"也会交卷，
 * 两个入口撞在一起、或 React 严格模式重复挂载，都会重复 POST。服务端有幂等
 * （`exam_submitted_at`），但客户端不该靠服务端兜底 —— 重复请求会让成绩页闪两次。
 */

/** 有未作答题时必须二次确认；返回提示文案，null = 直接交 */
export function submitConfirmMessage(
  unanswered: number,
  total: number,
): string | null {
  if (unanswered <= 0) return null;
  return `还有 ${unanswered} 题没作答（共 ${total} 题），交卷后这些题按未作答计分，确定交卷吗？`;
}

export interface SubmitGate {
  /** 抢到执行权返回 true；已有交卷在途/已完成返回 false */
  tryStart(): boolean;
  /** 请求失败后放行，允许用户重试 */
  reset(): void;
  /** 是否已经（或正在）交卷 */
  readonly started: boolean;
}

export function createSubmitGate(): SubmitGate {
  let started = false;
  return {
    tryStart() {
      if (started) return false;
      started = true;
      return true;
    },
    reset() {
      started = false;
    },
    get started() {
      return started;
    },
  };
}

/** 交卷用的稳定标识：同一份作答重试时不变（`crypto.randomUUID` 不可用时退化为时间戳） */
export function createClientKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
