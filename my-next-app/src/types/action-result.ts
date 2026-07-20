/**
 * Server Action 统一返回类型
 * Unified Server Action return type
 *
 * 全项目的 Server Actions 应统一使用此泛型，保证前端消费端的一致性。
 *
 * @example
 * // 无数据负载的操作（删除、更新等）
 * async function deleteAction(): Promise<ActionResult> { ... }
 *
 * // 有数据负载的操作（查询、创建等）
 * async function createAction(): Promise<ActionResult<{ id: number }>> { ... }
 */
export type ActionResult<T = undefined> = T extends undefined
  ? ActionResultBase
  : ActionResultBase & { data?: T };

interface ActionResultBase {
  /** 操作是否成功 */
  success: boolean;
  /** 错误消息（失败时） */
  error?: string;
  /** 成功/信息消息（可选） */
  message?: string;
}

/** 创建成功结果的辅助函数 */
export function ok<T>(
  data?: T,
): T extends undefined ? ActionResult : ActionResult<T> {
  if (data === undefined) {
    return { success: true } as T extends undefined
      ? ActionResult
      : ActionResult<T>;
  }
  return { success: true, data } as T extends undefined
    ? ActionResult
    : ActionResult<T>;
}

/** 创建失败结果的辅助函数 */
export function fail(error: string): ActionResult {
  return { success: false, error };
}
