/**
 * `toErrorResponse` 对拍测试的输入样本：库里每一个 Error 子类各一条，
 * 外加未归类兜底（裸 `Error` / `TypeError` / 字符串 / `undefined`）。
 *
 * 用法：`to-error-response.snapshot.json` 是**改血统之前**跑这些样本录下来的
 * 实际响应（status + body），对拍测试拿它逐条比。新增 Error 类时在这里加一条，
 * 并重录快照（见 parity 测试文件头）。
 *
 * 只放"能安全 new 出来"的类：构造函数参数取最小合法值，不连库、不读环境变量。
 */
import {
  AppError,
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { AiRawResponseError } from "@/lib/ai/types";
import { RecallDeckValidationError } from "@/lib/recall/schema";
import { ApiError } from "@/lib/utils/api-client";
import { AuthError } from "@/lib/services/auth";
import {
  BackupPasswordUndecryptableError,
  BackupSecretMissingError,
} from "@/lib/services/backup-service";
import {
  DraftConfirmError,
  DraftNotFoundError,
  DraftStateError,
} from "@/lib/services/draft-service";
import { InvalidQuestionIdsError } from "@/lib/services/import-service";
import {
  PdfImportStorageError,
  PdfImportTaskNotFoundError,
} from "@/lib/services/pdf-import";
import { PracticeSessionNotFoundError } from "@/lib/services/practice";
import { ReservedExternalIdError } from "@/lib/services/question-batch";
import {
  QuestionForbiddenError,
  QuestionValidationError,
} from "@/lib/services/question";
import {
  RecallImportError,
  RecallNotFoundError,
} from "@/lib/services/recall-import";
import {
  RecallCardNotFoundError,
  RecallServiceError,
} from "@/lib/services/recall";
import { DryRunRollback } from "@/lib/services/dry-run";

export interface ErrorSnapshotCase {
  /** 快照里的键，直接用类名（同一类只取一条代表样本） */
  name: string;
  make: () => unknown;
}

export const ERROR_SNAPSHOT_CASES: ErrorSnapshotCase[] = [
  // ---- AppError 家族：kind 决定状态码 ----
  { name: "AppError", make: () => new AppError("business", "示例业务错误") },
  { name: "ValidationError", make: () => new ValidationError("参数不合法") },
  { name: "BusinessError", make: () => new BusinessError("业务拒绝") },
  { name: "NotFoundError", make: () => new NotFoundError("资源不存在") },
  { name: "ConflictError", make: () => new ConflictError("已存在") },
  { name: "ForbiddenError", make: () => new ForbiddenError("无权访问") },

  // ---- 领域类（已继承 AppError） ----
  {
    name: "RecallDeckValidationError",
    make: () =>
      new RecallDeckValidationError([
        "cards[0]: 题干为空",
        "cards[1]: 答案为空",
      ]),
  },
  {
    name: "BackupSecretMissingError",
    make: () => new BackupSecretMissingError(),
  },
  {
    name: "BackupPasswordUndecryptableError",
    make: () => new BackupPasswordUndecryptableError(),
  },
  { name: "DraftNotFoundError", make: () => new DraftNotFoundError("draft-1") },
  {
    name: "DraftStateError",
    make: () => new DraftStateError("草稿状态已变化"),
  },
  {
    name: "DraftConfirmError",
    make: () => new DraftConfirmError(["items[0]: 内容为空"]),
  },
  {
    name: "PdfImportTaskNotFoundError",
    make: () => new PdfImportTaskNotFoundError(),
  },
  { name: "PdfImportStorageError", make: () => new PdfImportStorageError() },
  {
    name: "PracticeSessionNotFoundError",
    make: () => new PracticeSessionNotFoundError("sess-1"),
  },
  {
    name: "QuestionValidationError",
    make: () => new QuestionValidationError(["content: 太短"]),
  },
  { name: "QuestionForbiddenError", make: () => new QuestionForbiddenError() },
  {
    name: "RecallImportError",
    make: () =>
      new RecallImportError("未知的冲突策略：x", {
        kind: "validation",
        code: "recall.import.bad-strategy",
      }),
  },
  {
    name: "RecallNotFoundError",
    make: () => new RecallNotFoundError("卡组不存在：demo"),
  },
  {
    name: "RecallServiceError",
    make: () => new RecallServiceError("改判项必须是 { index, to } 对象"),
  },
  {
    name: "RecallCardNotFoundError",
    make: () => new RecallCardNotFoundError("卡片 L1-c07 不存在"),
  },

  // ---- 仍继承裸 Error 的类（本轮要么补血统，要么保持原样） ----
  { name: "AuthError", make: () => new AuthError("Username already exists") },
  {
    name: "InvalidQuestionIdsError",
    make: () => new InvalidQuestionIdsError([7, 8]),
  },
  {
    name: "ReservedExternalIdError",
    make: () => new ReservedExternalIdError([2]),
  },
  {
    name: "AiRawResponseError",
    make: () => new AiRawResponseError("AI 返回了非 JSON", "not-json"),
  },
  {
    name: "ApiError",
    make: () => new ApiError(503, "Service Unavailable", "Server error 503"),
  },
  // dry-run 哨兵：正常路径不该到 toErrorResponse，这里只锁"漏到兜底时"的行为
  { name: "DryRunRollback", make: () => new DryRunRollback({ created: 3 }) },

  // ---- 未归类兜底 ----
  { name: "Error", make: () => new Error("SQLITE_BUSY: /app/data/x.db") },
  { name: "TypeError", make: () => new TypeError("x is not a function") },
  { name: "string", make: () => "字符串错误" },
  { name: "undefined", make: () => undefined },
  { name: "null", make: () => null },
  {
    name: "plainObject",
    make: () => ({ code: "weird", message: "非 Error 对象" }),
  },
];
