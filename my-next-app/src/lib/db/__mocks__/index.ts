import { vi } from 'vitest';

/**
 * 内部工厂函数：创建一个支持 Drizzle ORM 链式调用的 Mock 对象
 */
function createDrizzleMock() {
  const chain: any = {
    // 默认返回空数组的异步 Promise，使其可被直接 await
    then: vi.fn((resolve) => resolve([])),
  };

  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'groupBy'
  ];

  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });

  // 支持事务模拟 (默认同步执行回调)
  chain.transaction = vi.fn((cb: any) => cb(chain));

  return chain;
}

// 导出单例 Mock 实例
export const drizzleDb = createDrizzleMock();

// 导出旧版 Better-SQLite3 Mock 实例
export const db = {
  prepare: vi.fn(() => ({
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
    get: vi.fn(),
    all: vi.fn().mockReturnValue([]),
  })),
  transaction: vi.fn((cb) => cb()),
  exec: vi.fn(),
  close: vi.fn(),
};

// 重置助手函数：用于在 beforeEach 中恢复 Mock 的初始链式行为
export const resetDrizzleMock = (defaultReturn: any = []) => {
  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'groupBy'
  ];

  methods.forEach((m) => {
    if (drizzleDb[m] && drizzleDb[m].mockReturnValue) {
      drizzleDb[m].mockReturnValue(drizzleDb);
    }
  });

  if (drizzleDb.then && drizzleDb.then.mockImplementation) {
    drizzleDb.then.mockImplementation((resolve: any) => resolve(defaultReturn));
  }
};

// 导出 drizzleSchema
import * as schema from './drizzle-schema';
export const drizzleSchema = schema;

// 兼容多种导出方式
export default db;
export const getLegacyDb = () => db;
export const initDatabase = vi.fn().mockResolvedValue(undefined);
export const reinitDb = vi.fn().mockReturnValue(db);
export const closeDb = vi.fn();
