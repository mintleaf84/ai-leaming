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
    calls: [] as { sql: string; args: any[] }[],
  };

  const mockRun = vi.fn().mockImplementation((...args: any[]) => {
    return { lastInsertRowid: 100, changes: 1 };
  });

  const mockGet = vi.fn();
  const mockAll = vi.fn();

  const prepare = vi.fn().mockImplementation((sql: string) => {
    return {
      run: vi.fn().mockImplementation((...args: any[]) => {
        state.calls.push({ sql, args });
        return mockRun(...args);
      }),
      get: vi.fn().mockImplementation((...args: any[]) => {
        state.calls.push({ sql, args });
        return mockGet(...args);
      }),
      all: vi.fn().mockImplementation((...args: any[]) => {
        state.calls.push({ sql, args });
        return mockAll(...args);
      }),
    };
  });

  const transaction = vi.fn().mockImplementation((cb: () => any) => {
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
