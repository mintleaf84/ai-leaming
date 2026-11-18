/**
 * dry-run 的公共实现：**在真实事务里跑完真实写入路径，再用哨兵异常强制回滚**。
 *
 * 为什么不写一套"预演逻辑"：
 *   预演逻辑与实际写入是两份代码，任何一处口径演进都会让"预演说会写 3 条、实际写了 5 条"，
 *   而 agent 恰恰是拿预演结果决定要不要真发请求的（见 docs/api.md §9）。
 *   用回滚实现，预演与真执行共用同一条代码路径，计数天然一致
 *   （docs/engineering.md 的"同一份数据执行两次不得产生重复"约束也依赖这一点）。
 *
 * 代价：dry-run 仍会消耗一次事务（写 → 回滚）。对"提交前预演"这个用法是可接受的。
 */

/** 内部哨兵：抛出它表示"这次是预演"，事务回滚，并把 value 带回调用方。 */
export class DryRunRollback<T = unknown> extends Error {
  readonly value: T;

  constructor(value: T) {
    super("dry-run 回滚（预期分支，不应上报）");
    this.name = "DryRunRollback";
    this.value = value;
  }
}

/**
 * 判断是否为 dry-run 哨兵。
 *
 * 不用 `instanceof`：vitest 里同一模块可能被多个测试隔离环境各加载一次，
 * `instanceof` 会因类身份不同而漏判 —— 按 name 判定更稳（name 由本类唯一占用）。
 */
export function isDryRunRollback<T = unknown>(
  err: unknown,
): err is DryRunRollback<T> {
  return (
    err instanceof DryRunRollback ||
    (err instanceof Error && err.name === "DryRunRollback")
  );
}
