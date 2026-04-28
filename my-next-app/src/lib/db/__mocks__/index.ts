import { vi } from 'vitest';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as actualSchema from '../drizzle-schema';

/**
 * 强类型的 MockedDrizzle 定义
 */
export type MockedDrizzle = {
    [K in keyof LibSQLDatabase<any>]: any;
} & {
    select: any;
    from: any;
    where: any;
    limit: any;
    offset: any;
    orderBy: any;
    then: any;
    all: any;
    get: any;
    run: any;
    insert: any;
    values: any;
    update: any;
    set: any;
    delete: any;
    query: {
        [table in keyof typeof actualSchema]: {
            findFirst: any;
            findMany: any;
        }
    }
};

/**
 * 创建一个清爽的、无状态污染的 Mock 实例
 */
function createDrizzleMock(): MockedDrizzle {
    const mock: any = new Proxy(() => {}, {
        get: (target: any, prop: string) => {
            // 处理 Promise 的 then 方法
            if (prop === 'then') {
                if (!target._then) target._then = vi.fn((resolve) => resolve([]));
                return target._then;
            }

            // 处理关系查询 query
            if (prop === 'query') {
                if (!target._query) {
                    target._query = new Proxy({}, {
                        get: (_, table: string) => {
                            if (!target[`_q_${table}`]) {
                                target[`_q_${table}`] = {
                                    findFirst: vi.fn().mockResolvedValue(null),
                                    findMany: vi.fn().mockResolvedValue([])
                                };
                            }
                            return target[`_q_${table}`];
                        }
                    });
                }
                return target._query;
            }

            // 处理事务
            if (prop === 'transaction') {
                return vi.fn((cb) => cb(mock));
            }

            // 处理通用方法：如果还没创建 Mock，就创建一个
            if (!target[prop]) {
                const isExec = ['all', 'get', 'run', 'execute'].includes(prop);
                target[prop] = vi.fn(() => isExec ? Promise.resolve([]) : mock);
                
                // 让执行方法直接返回 Promise
                if (isExec) {
                    target[prop].mockResolvedValue([]);
                }
            }
            return target[prop];
        },
        // 支持直接作为函数调用 (虽然 Drizzle 实例不是函数，但 Proxy 兼容性更好)
        apply: (target) => mock
    });

    return mock as MockedDrizzle;
}

export const drizzleDb = createDrizzleMock();
export const drizzleSchema = actualSchema;

/**
 * 优雅的重置助手
 */
export const resetDrizzleMock = (defaultReturn: any = []) => {
    vi.clearAllMocks();
    
    const target = drizzleDb as any;
    
    // 重置 then
    if (target._then) {
        target._then.mockImplementation((resolve: any) => resolve(defaultReturn));
    }

    // 重置所有已缓存的方法
    Object.keys(target).forEach(key => {
        if (typeof target[key]?.mockResolvedValue === 'function') {
            const isExec = ['all', 'get', 'run', 'execute'].includes(key) || key.startsWith('_q_');
            if (isExec) {
                if (key.startsWith('_q_')) {
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
