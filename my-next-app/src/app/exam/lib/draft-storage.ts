/**
 * 作答草稿的本地暂存（sessionStorage，按 sessionId 分键）。
 *
 * 为什么要有：试卷默认不限时，用户可能在作答中刷新或切后台回来；倒计时按服务端
 * `deadlineAt` 恢复，答案却只存在内存里 —— 刷新就全丢。这里只存**用户的选择**，
 * 不存判分结果、不进数据库（契约 §4 的判分仍在交卷时一次完成）。
 *
 * 只认 sessionStorage：关掉标签页即清空，避免"上次的草稿"串到下一次作答。
 */
import { safeParseJson } from "@/lib/utils/json";
import type { ExamDraftMap } from "./answer-sheet";

const PREFIX = "exam-draft:";
const DEADLINE_PREFIX = "exam-deadline:";

function keyFor(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // audit-allow: 隐私模式/禁用存储时没有暂存能力，作答仍在内存中正常进行
    return null;
  }
}

export function loadDrafts(sessionId: string): ExamDraftMap {
  const store = storage();
  if (!store) return {};
  const raw = store.getItem(keyFor(sessionId));
  const parsed = safeParseJson<unknown>(raw, null);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const drafts: ExamDraftMap = {};
  for (const [questionId, draft] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const id = Number(questionId);
    if (!Number.isFinite(id) || typeof draft !== "object" || draft === null) {
      continue;
    }
    const record = draft as Record<string, unknown>;
    if (record.kind === "choice" && Array.isArray(record.letters)) {
      drafts[id] = {
        kind: "choice",
        letters: record.letters.filter(
          (item): item is string => typeof item === "string",
        ),
      };
    } else if (record.kind === "fill" && Array.isArray(record.blanks)) {
      drafts[id] = {
        kind: "fill",
        blanks: record.blanks.map((item) =>
          typeof item === "string" ? item : "",
        ),
      };
    }
  }
  return drafts;
}

export function saveDrafts(sessionId: string, drafts: ExamDraftMap): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(sessionId), JSON.stringify(drafts));
  } catch {
    // audit-allow: 配额满/隐私模式时放弃暂存，不影响作答与交卷
    return;
  }
}

export function clearDrafts(sessionId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(sessionId));
  } catch {
    // audit-allow: 清理失败最多留一份无主草稿，不阻断交卷
    return;
  }
}

/**
 * 记住"这次作答的 deadline"。
 *
 * 契约把 `deadlineAt` 写在"开始作答"的返回里，而刷新页面后走的是
 * `GET /attempts/{sessionId}` —— 那份响应不一定带。这里把服务端给的时间戳
 * 原样存一份，刷新/切后台回来仍按同一个 deadline 计时，**不在本地推算**
 * （本地推算会在关标签页再打开、跨设备时彻底错位）。
 */
export function saveDeadline(
  sessionId: string,
  deadlineAt: string | null,
): void {
  const store = storage();
  if (!store) return;
  try {
    if (deadlineAt) store.setItem(`${DEADLINE_PREFIX}${sessionId}`, deadlineAt);
    else store.removeItem(`${DEADLINE_PREFIX}${sessionId}`);
  } catch {
    // audit-allow: 存不下时退化为"本次刷新后按服务端字段显示"，不影响交卷
    return;
  }
}

export function loadDeadline(sessionId: string): string | null {
  const store = storage();
  if (!store) return null;
  return store.getItem(`${DEADLINE_PREFIX}${sessionId}`) || null;
}

export function clearDeadline(sessionId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(`${DEADLINE_PREFIX}${sessionId}`);
  } catch {
    // audit-allow: 与 clearDrafts 同理，清理失败不影响交卷
    return;
  }
}
