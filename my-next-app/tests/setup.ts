
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 每次测试后清理组件
afterEach(() => {
    cleanup()
})

// Mock 全局 fetch (如果尚未存在)
global.fetch = global.fetch || (() => Promise.resolve({
    json: () => Promise.resolve({}),
} as Response));

// Mock scrollIntoView 因为 jsdom 不支持
if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = () => { };
}
