// @vitest-environment node
/**
 * `toErrorResponse` 对拍测试：库里每一个 Error 子类都被钉在**改血统之前**录下的
 * 响应上，防止"收敛错误映射"顺手改了对外契约。
 *
 * ## 不变量
 *
 * 1. `status` 与 `body.error` 逐条一致 —— 这是客户端唯一会拿去做分支的两个字段；
 * 2. 除下面 `INTENTIONAL_DELTAS` 明列的 2 条，其余 case 的**整个 body**（含 `code`、
 *    `issues`、`issueCount`）也必须逐字节一致，防止顺手改码；
 * 3. 新增 Error 类必须同时加一条样本（`error-snapshot-cases.ts`），否则本文件
 *    的"样本集合一致"用例会红。
 *
 * ## 重录快照
 *
 * 只在**确认要改契约**时做：把 `error-response.ts` 临时换回旧实现（或 git stash），
 * 用一个临时 vitest 用例把 `renderError()` 的结果写回
 * `fixtures/to-error-response.snapshot.json`，再删掉临时用例。快照本身不手改。
 */
import { describe, it, expect } from "vitest";
import snapshot from "./fixtures/to-error-response.snapshot.json";
import { ERROR_SNAPSHOT_CASES } from "./fixtures/error-snapshot-cases";
import { renderError } from "./fixtures/render-error";
import { isAppError, ValidationError } from "../app-error";
import { InvalidQuestionIdsError } from "@/lib/services/import-service";
import { ReservedExternalIdError } from "@/lib/services/question-batch";

interface SnapshotEntry {
  name: string;
  status: number;
  body: Record<string, unknown>;
}

const BEFORE = snapshot as SnapshotEntry[];
const BEFORE_BY_NAME = new Map(BEFORE.map((entry) => [entry.name, entry]));

/**
 * 改前是 500 + 「服务器内部错误」（当时它们还是裸 `Error`，落到兜底路径）。
 * 补上 `AppError` 血统后变成 400 + 可读文案 —— 这是本轮**唯一**有意的契约变化，
 * 且只影响"路由漏写 instanceof 分支"的安全网路径；写了分支的路由响应不变。
 */
const INTENTIONAL_DELTAS: Record<string, { status: number; code: string }> = {
  InvalidQuestionIdsError: { status: 400, code: "questions.ids.invalid" },
  ReservedExternalIdError: {
    status: 400,
    code: "questions.external-id.reserved",
  },
};

describe("toErrorResponse 对拍（改前快照 vs 改后实现）", () => {
  it("样本集合与快照一一对应（新增 Error 类必须先加样本）", () => {
    const caseNames = ERROR_SNAPSHOT_CASES.map((c) => c.name).sort();
    const snapshotNames = BEFORE.map((e) => e.name).sort();
    expect(caseNames).toEqual(snapshotNames);
    expect(new Set(caseNames).size).toBe(caseNames.length);
  });

  it.each(ERROR_SNAPSHOT_CASES.map((c) => [c.name, c] as const))(
    "%s：status 与 body.error 与改前一致",
    async (name, testCase) => {
      const before = BEFORE_BY_NAME.get(name);
      if (!before) throw new Error(`快照里没有 ${name}`);
      const error = testCase.make();
      const after = await renderError(error);
      const delta = INTENTIONAL_DELTAS[name];

      if (delta) {
        // 有意变化：锁定新口径，同时确认改前确实是 500（说明这确实是一次变化）
        expect(before.status).toBe(500);
        expect(after.status).toBe(delta.status);
        expect(after.body.error).toBe(
          error instanceof Error ? error.message : before.body.error,
        );
        expect(after.body.code).toBe(delta.code);
        return;
      }

      expect(after.status).toBe(before.status);
      expect(after.body.error).toBe(before.body.error);
      // 整包逐字节（含 code/issues/issueCount）
      expect(after.body).toEqual(before.body);
    },
  );
});

describe("补血统的兜底口径（不写 instanceof 分支时）", () => {
  it("InvalidQuestionIdsError 现在被 isAppError 认，且仍是 ValidationError", () => {
    const error = new InvalidQuestionIdsError([7, 8]);
    expect(isAppError(error)).toBe(true);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("questions.ids.invalid");
    // 结构化字段不能丢：路由的 instanceof 分支还要读它
    expect(error.invalidQuestionIds).toEqual([7, 8]);
    expect(error.message).toBe("以下题目不存在或不可见: 7, 8");
  });

  it("ReservedExternalIdError 现在被 isAppError 认，且仍是 ValidationError", () => {
    const error = new ReservedExternalIdError([2]);
    expect(isAppError(error)).toBe(true);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("questions.external-id.reserved");
    expect(error.indexes).toEqual([2]);
  });

  it("漏写 instanceof 分支时也是 400 + 读得懂的文案，而不是 500", async () => {
    const idsError = await renderError(new InvalidQuestionIdsError([7, 8]));
    expect(idsError.status).toBe(400);
    expect(idsError.body).toEqual({
      error: "以下题目不存在或不可见: 7, 8",
      code: "questions.ids.invalid",
    });

    const reservedError = await renderError(new ReservedExternalIdError([2]));
    expect(reservedError.status).toBe(400);
    expect(reservedError.body).toEqual({
      error: 'externalId 不能以 "api:" 开头（该前缀为服务端内容指纹保留）',
      code: "questions.external-id.reserved",
    });
  });

  it("客户端/AI 内部的裸 Error 保持原样（不进 HTTP 码表）", async () => {
    const { AuthError } = await import("@/lib/services/auth");
    const { AiRawResponseError } = await import("@/lib/ai/types");
    const { ApiError } = await import("@/lib/utils/api-client");
    for (const error of [
      new AuthError("Username already exists"),
      new AiRawResponseError("bad json", "not-json"),
      new ApiError(503, "Service Unavailable", "Server error 503"),
    ]) {
      expect(isAppError(error)).toBe(false);
      const rendered = await renderError(error);
      expect(rendered.status).toBe(500);
      expect(rendered.body).toEqual({
        error: "服务器内部错误",
        code: "internal",
      });
    }
  });
});
