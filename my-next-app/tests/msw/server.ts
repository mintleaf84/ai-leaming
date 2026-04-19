/**
 * MSW Node Server 配置
 *
 * 在 Vitest（jsdom 环境）中，MSW 使用 Node.js 拦截器来模拟网络请求。
 * 本文件创建并导出一个可以在测试生命周期中管理的服务器实例。
 *
 * 用法（在 tests/setup.ts 中）：
 *   import { server } from './msw/server'
 *   beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
 *   afterEach(() => server.resetHandlers())
 *   afterAll(() => server.close())
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// 创建 MSW 服务器实例，注入默认处理器列表
export const server = setupServer(...handlers)
