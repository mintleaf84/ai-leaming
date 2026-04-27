import { vi } from 'vitest';

/**
 * 一个增强型数据库 Mock 工具，用于追踪事务状态和 SQL 调用。
 * 解决“掩耳盗铃”式测试中的伪事务问题。
 */
export const createBetterDbMock = () => {
  const state = {
    isTransactionOpen: false,
    wasCommitted: false,
    wasRolledBack: false,
    calls: [] as { sql: string; args: unknown[] }[],
  };

  const mockRun = vi.fn().mockImplementation((..._args: unknown[]) => {
    return { lastInsertRowid: 100, changes: 1 };
  });

  const mockGet = vi.fn();
  const mockAll = vi.fn();

  const prepare = vi.fn().mockImplementation((sql: string) => {
    return {
      run: vi.fn().mockImplementation((...args: unknown[]) => {
        state.calls.push({ sql, args });
        return mockRun(...args);
      }),
      get: vi.fn().mockImplementation((...args: unknown[]) => {
        state.calls.push({ sql, args });
        return mockGet(...args);
      }),
      all: vi.fn().mockImplementation((...args: unknown[]) => {
        state.calls.push({ sql, args });
        return mockAll(...args);
      }),
    };
  });

  const transaction = vi.fn().mockImplementation((cb: () => unknown) => {
    state.isTransactionOpen = true;
    try {
      const result = cb();
      state.wasCommitted = true;
      return result;
    } catch (error) {
      state.wasRolledBack = true;
      throw error;
    } finally {
      state.isTransactionOpen = false;
    }
  });

  return {
    prepare,
    transaction,
    exec: vi.fn(),
    // 暴露状态与底层 Mock 以便自定义行为
    _state: state,
    _mockRun: mockRun,
    _mockGet: mockGet,
    _mockAll: mockAll,
    // 助手方法
    reset: () => {
      state.isTransactionOpen = false;
      state.wasCommitted = false;
      state.wasRolledBack = false;
      state.calls = [];
      vi.clearAllMocks();
    },
    getLastSqlCall: () => state.calls[state.calls.length - 1],
  };
};

/**
 * 创建一个支持 Drizzle ORM 链式调用的增强型 Mock 对象。
 * 支持：select, insert, update, delete, join, where, limit, orderBy, onConflictDoUpdate 等。
 */
export const createDrizzleMock = () => {
  const chain: any = {
    // 默认返回空数组的异步 Promise，使其可被直接 await
    then: vi.fn((resolve) => resolve([])),
  };

  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin'
  ];

  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });

  // 支持事务模拟 (默认同步执行回调)
  chain.transaction = vi.fn((cb) => cb(chain));

  return chain;
};

/**
 * 重置 Drizzle Mock 的所有链式调用状态，使其恢复默认的链式行为。
 * @param mockObject createDrizzleMock 生成的对象
 * @param defaultReturn 默认的 Await 返回值（默认为空数组）
 */
export const resetDrizzleMock = (mockObject: any, defaultReturn: any = []) => {
  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin'
  ];

  methods.forEach((m) => {
    if (mockObject[m] && mockObject[m].mockReturnValue) {
      mockObject[m].mockReturnValue(mockObject);
    }
  });

  if (mockObject.then && mockObject.then.mockImplementation) {
    mockObject.then.mockImplementation((resolve: any) => resolve(defaultReturn));
  }
};
