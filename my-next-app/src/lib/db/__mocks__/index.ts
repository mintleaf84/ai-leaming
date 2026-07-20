import { vi } from "vitest";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as actualSchema from "../drizzle-schema";

/**
 * 强类型的 MockedDrizzle 定义
 */
export type MockedDrizzle = {
  [K in keyof LibSQLDatabase<Record<string, unknown>>]: (
    ...args: unknown[]
  ) => MockedDrizzle;
} & {
  select: (...args: unknown[]) => MockedDrizzle;
  from: (...args: unknown[]) => MockedDrizzle;
  where: (...args: unknown[]) => MockedDrizzle;
  limit: (...args: unknown[]) => MockedDrizzle;
  offset: (...args: unknown[]) => MockedDrizzle;
  orderBy: (...args: unknown[]) => MockedDrizzle;
  then: (resolve: (value: unknown[]) => unknown) => unknown;
  all: <T = unknown>() => Promise<T[]>;
  get: <T = unknown>() => Promise<T | null>;
  run: () => Promise<unknown>;
  insert: (...args: unknown[]) => MockedDrizzle;
  values: (...args: unknown[]) => MockedDrizzle;
  update: (...args: unknown[]) => MockedDrizzle;
  set: (...args: unknown[]) => MockedDrizzle;
  delete: (...args: unknown[]) => MockedDrizzle;
  query: {
    [table in keyof typeof actualSchema]: {
      findFirst: (...args: unknown[]) => Promise<unknown>;
      findMany: (...args: unknown[]) => Promise<unknown[]>;
    };
  };
};

/**
 * 创建一个清爽的、无状态污染的 Mock 实例
 */
function createDrizzleMock(): MockedDrizzle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Proxy handler internals require flexible typing
  const mock: any = new Proxy(() => {}, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Proxy handler target has dynamic properties
    get: (target: any, prop: string) => {
      // 处理 Promise 的 then 方法
      if (prop === "then") {
        if (!target._then) target._then = vi.fn((resolve) => resolve([]));
        return target._then;
      }

      // 处理关系查询 query
      if (prop === "query") {
        if (!target._query) {
          target._query = new Proxy(
            {},
            {
              get: (_, table: string) => {
                if (!target[`_q_${table}`]) {
                  target[`_q_${table}`] = {
                    findFirst: vi.fn().mockResolvedValue(null),
                    findMany: vi.fn().mockResolvedValue([]),
                  };
                }
                return target[`_q_${table}`];
              },
            },
          );
        }
        return target._query;
      }

      // 处理事务
      if (prop === "transaction") {
        return vi.fn((cb) => cb(mock));
      }

      // 处理通用方法：如果还没创建 Mock，就创建一个
      if (!target[prop]) {
        const isExec = ["all", "get", "run", "execute"].includes(prop);
        target[prop] = vi.fn(() => (isExec ? Promise.resolve([]) : mock));

        // 让执行方法直接返回 Promise
        if (isExec) {
          target[prop].mockResolvedValue([]);
        }
      }
      return target[prop];
    },
    // 支持直接作为函数调用 (虽然 Drizzle 实例不是函数，但 Proxy 兼容性更好)
    apply: (target) => mock,
  });

  return mock as MockedDrizzle;
}

export const drizzleDb = createDrizzleMock();
export const drizzleSchema = actualSchema;

/**
 * 优雅的重置助手
 */
export const resetDrizzleMock = (defaultReturn: unknown = []) => {
  vi.clearAllMocks();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Proxy mock internals require dynamic property access
  const target = drizzleDb as any;

  // 重置 then
  if (target._then) {
    target._then.mockImplementation((resolve: (value: unknown) => unknown) =>
      resolve(defaultReturn),
    );
  }

  // 重置所有已缓存的方法
  Object.keys(target).forEach((key) => {
    if (typeof target[key]?.mockResolvedValue === "function") {
      const isExec =
        ["all", "get", "run", "execute"].includes(key) || key.startsWith("_q_");
      if (isExec) {
        if (key.startsWith("_q_")) {
          target[key].findFirst.mockResolvedValue(null);
          target[key].findMany.mockResolvedValue([]);
        } else {
          target[key].mockResolvedValue(defaultReturn);
        }
      } else {
        target[key].mockReturnValue(drizzleDb);
      }
    }
  });
};

// --- Legacy 兼容层 ---
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
export default db;
export const getLegacyDb = () => db;
export const initDatabase = vi.fn().mockResolvedValue(undefined);
export const reinitDb = vi.fn().mockReturnValue(db);
export const closeDb = vi.fn();
