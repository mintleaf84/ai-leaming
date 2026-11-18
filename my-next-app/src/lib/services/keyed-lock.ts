/**
 * 按键串行化的进程内锁。
 *
 * 用途：同一身份 + 同一资源的多笔写必须串行，否则"读到旧值 → 各自 +1 → 后者覆盖前者"
 * 会让计数丢失（典型场景：user+question 的 SRS 调度）。SQLite 的写事务本身是串行的，
 * 但 deferred 事务里"先读后写"仍可能读到同一快照，因此需要在应用层把"读—算—写"整段串起来。
 *
 * 边界：只保证**单进程内**互斥。多实例部署时要换成数据库层唯一键/版本号，
 * 这条和多实例的整体限制一起记录在 docs/engineering.md 的已知取舍里。
 */

const chains = new Map<string, Promise<unknown>>();

export function withKeyedLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // 前一个任务失败也要继续排队（then 的两个分支都指向 fn）
  const run = previous.then(fn, fn);
  const guard: Promise<unknown> = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, guard);

  // 队列空了就把 key 删掉，避免 Map 随用户/题目数无限增长
  void guard.then(() => {
    if (chains.get(key) === guard) {
      chains.delete(key);
    }
  });

  return run;
}
