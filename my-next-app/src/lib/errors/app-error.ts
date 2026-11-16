/**
 * 业务错误的统一分类。
 *
 * ## 为什么要有这一层
 *
 * 此前每个功能各自定义 Error 类（9 个，其中 5 个属于回忆自测一个功能），
 * 再各自在路由里写一段 `instanceof` 链映射成 HTTP 状态码 —— 只有 recall 写了
 * `recallErrorResponse`，于是「同一类错误在不同接口返回不同状态码」只是时间问题。
 *
 * 这里把「错误的语义」和「传输层的映射」分开：
 * - 语义只有几种（参数非法 / 不存在 / 冲突 / 无权限 / 业务拒绝）；
 * - 映射只有一处（`src/lib/api/error-response.ts`）。
 *
 * 领域类继续沿用自己原来的名字（`RecallNotFoundError` 等），只是继承这些基类，
 * 这样调用点、日志与既有测试都不用改。
 */

export type AppErrorKind =
  | "validation" // 参数/载荷不合法 → 400
  | "business" // 明确业务拒绝（状态不允许等），不是参数错误 → 400
  | "not-found" // 资源不存在（或不可见） → 404
  | "conflict" // 与现有状态冲突（重复、版本过期） → 409
  | "forbidden"; // 已认证但无权访问该资源 → 403

const STATUS_BY_KIND: Record<AppErrorKind, number> = {
  validation: 400,
  business: 400,
  "not-found": 404,
  conflict: 409,
  forbidden: 403,
};

export interface AppErrorOptions {
  /** 机器可读的错误码，例如 `recall.deck.conflict`；不设则沿用 kind */
  code?: string;
  /** 结构化明细（校验错误一次报全；映射层负责截断，避免响应体失控） */
  issues?: string[];
  /** 对外文案。默认用 `message`；内部诊断信息不该直接给用户时用它 */
  publicMessage?: string;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly code: string;
  readonly issues?: string[];
  readonly publicMessage: string;

  constructor(
    kind: AppErrorKind,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.code = options.code ?? kind;
    this.issues = options.issues;
    this.publicMessage = options.publicMessage ?? message;
  }

  get status(): number {
    return STATUS_BY_KIND[this.kind];
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("validation", message, options);
  }
}

export class BusinessError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("business", message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("not-found", message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("conflict", message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("forbidden", message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
