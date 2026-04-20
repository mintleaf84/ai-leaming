
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 每次测试后清理组件
afterEach(() => {
    cleanup()
})

// Mock scrollIntoView 因为 jsdom 不支持
if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = () => { };
    // Radix UI 需要 pointer event API，jsdom 不支持
    Element.prototype.hasPointerCapture = () => false;
    (Element.prototype as unknown).setPointerCapture = () => { };
    (Element.prototype as unknown).releasePointerCapture = () => { };
}
