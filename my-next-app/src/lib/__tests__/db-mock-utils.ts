import { vi } from 'vitest';
import { setupTestDb } from './test-db-utils';

/**
 * [最佳实践] 设置并返回一个初始化好的内存数据库 (Drizzle 版)
 * 该方法利用 @libsql/client 的 :memory: 模式，提供 100% 真实的 SQL 环境。
 */
export async function setupVitestMemoryDb() {
  return await setupTestDb();
}


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
 */
export const createDrizzleMock = () => {
  const chain: any = {
    // 默认返回空数组的异步 Promise，使其可被直接 await
    then: vi.fn((resolve) => resolve([])),
  };

  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'groupBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin',
    'all', 'get', 'run', 'execute'
  ];

  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });

  // 使执行方法默认返回 chain (proxy)，从而统一通过 then 陷阱处理结果
  ['get', 'all', 'run', 'execute'].forEach(m => {
    chain[m] = vi.fn(() => chain);
  });

  // 支持事务模拟 (默认同步执行回调)
  chain.transaction = vi.fn((cb) => cb(chain));

  // 支持关系查询 query
  chain.query = new Proxy({}, {
    get: (_target, table: string) => ({
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([])
    })
  });

  return chain;
};

/**
 * [已过时] 创建一个“感知表名”的 Drizzle Mock 代理。
 * @deprecated 请优先使用 setupVitestMemoryDb() 以获得更真实的测试环境。
 */
export const createTableAwareDrizzleMock = (initialTableData: Record<string, any[]> = {}) => {
  const baseMock = createDrizzleMock();
  const tableData = { ...initialTableData };
  
  let queryProxy: any = null;
  let currentTable: string | null = null;

  const proxy = new Proxy(baseMock, {
    get: (target, prop: string) => {
      if (prop === 'injectTableData') {
        return (data: Record<string, any[]>) => {
          Object.assign(tableData, data);
        };
      }

      if (prop === 'resetTableData') {
          return () => {
              for (const key in tableData) delete tableData[key];
          };
      }

      // 拦截执行方法，返回一个带有 apply 陷阱的代理
      if (['get', 'all', 'run', 'execute'].includes(prop)) {
        return new Proxy(target[prop], {
          apply: (fnTarget, thisArg, args) => {
            const table = currentTable;
            currentTable = null; // 消费后重置

            if (table && tableData[table]) {
              const data = tableData[table];
              return Promise.resolve(prop === 'get' ? (data[0] || null) : data);
            }
            
            // 否则调用原始 mock 函数 (支持 mockResolvedValueOnce 等)
            return Reflect.apply(fnTarget, thisArg, args);
          }
        });
      }

      if (['from', 'update', 'insert', 'delete', 'select'].includes(prop)) {
        return new Proxy(target[prop], {
          apply: (fnTarget, thisArg, args) => {
            const table = args[0];
            // 尝试多种 Drizzle 表名获取方式
            const tableName = typeof table === 'string' ? table : 
                             (table?.name || 
                              table?._?.name || 
                              table?._?.name?.name || 
                              table?.table || 
                              table?.[Symbol.for('drizzle:Name')]);
            
            if (tableName) {
              console.log(`[MockDB] Detected table: ${tableName} from ${prop}`);
              currentTable = tableName;
            } else if (table && typeof table === 'object') {
              // 如果是对象但没提取到名字，记录一下键值以便分析
              // console.log(`[MockDB] Failed to extract name from object keys: ${Object.keys(table).join(',')}`);
            }
            return Reflect.apply(fnTarget, thisArg, args);
          }
        });
      }

      // then 特别重要，使用 apply 陷阱以支持稳定 Mock 与动态数据的结合
      if (prop === 'then') {
        return new Proxy(target.then, {
          apply: (fnTarget, thisArg, args) => {
            const table = currentTable;
            currentTable = null; // 消费后重置
            
            if (table && tableData[table]) {
              console.log(`[MockDB] Resolving data for table: ${table}, count: ${tableData[table].length}`);
              const [resolve, reject] = args;
              return Promise.resolve(tableData[table]).then(resolve, reject);
            }
            
            return Reflect.apply(fnTarget, thisArg, args);
          }
        });
      }

      // query 保持原有逻辑，但需要稳定
      if (prop === 'query') {
        if (!queryProxy) {
          const tableCache: Record<string, any> = {};
          queryProxy = new Proxy({}, {
            get: (_, table: string) => {
              if (!tableCache[table]) {
                tableCache[table] = {
                  findFirst: vi.fn().mockImplementation(() => {
                    const data = tableData[table] || [];
                    return Promise.resolve(data[0] || null);
                  }),
                  findMany: vi.fn().mockImplementation(() => {
                    return Promise.resolve(tableData[table] || []);
                  })
                };
              }
              return tableCache[table];
            }
          });
        }
        return queryProxy;
      }

      return target[prop];
    }
  });

  return proxy;
};

/**
 * 重置 Drizzle Mock 的所有链式调用状态，使其恢复默认的链式行为。
 */
export const resetDrizzleMock = (mockObject: any, defaultReturn: any = []) => {
  const methods = [
    'insert', 'values', 'returning', 'update', 'set', 'delete',
    'select', 'from', 'where', 'limit', 'offset', 'orderBy', 'groupBy',
    'onConflictDoUpdate', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin'
  ];

  methods.forEach((m) => {
    if (mockObject[m] && mockObject[m].mockReset) {
      mockObject[m].mockReset();
      mockObject[m].mockReturnValue(mockObject);
    }
  });

  ['get', 'all', 'run', 'execute'].forEach(m => {
    if (mockObject[m] && mockObject[m].mockReset) {
        mockObject[m].mockReset();
        mockObject[m].mockResolvedValue(defaultReturn);
    }
  });

  if (mockObject.then && mockObject.then.mockReset) {
    mockObject.then.mockReset();
    mockObject.then.mockImplementation((resolve: any) => resolve(defaultReturn));
  }

  if (mockObject.transaction && mockObject.transaction.mockReset) {
    mockObject.transaction.mockReset();
    mockObject.transaction.mockImplementation((cb: any) => cb(mockObject));
  }
};
