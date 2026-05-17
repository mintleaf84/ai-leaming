// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripHtml } from '../security';

describe('Security Utils', () => {
    describe('sanitizeHtml', () => {
        it('应该移除 script 标签', () => {
            const result = sanitizeHtml('<p>Hello</p><script>alert(1)</script>');
            expect(result).not.toContain('<script>');
        });

        it('应该移除 iframe 标签', () => {
            const result = sanitizeHtml('<p>Test</p><iframe src="evil"></iframe>');
            expect(result).not.toContain('<iframe');
        });

        it('应该移除 onclick 事件属性', () => {
            const result = sanitizeHtml('<a href="https://example.com" onclick="alert(1)">Click</a>');
            expect(result).toContain('<a');
            expect(result).not.toContain('onclick');
        });

        it('应该移除 onerror 事件属性', () => {
            const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
            expect(result).not.toContain('onerror');
        });

        it('应该阻止 javascript: 伪协议', () => {
            const result = sanitizeHtml('<a href="javascript:alert(1)">Link</a>');
            expect(result).not.toContain('javascript:');
        });

        it('应该保留安全的标签', () => {
            const result = sanitizeHtml('<p>Hello <b>World</b></p>');
            expect(result).toContain('<p>');
            expect(result).toContain('<b>');
        });

        it('应该处理空字符串', () => {
            const result = sanitizeHtml('');
            expect(result).toBe('');
        });

        it('应该处理 null 输入', () => {
            const result = sanitizeHtml(null as any);
            expect(result).toBe('');
        });

        it('应该移除 style 属性', () => {
            const result = sanitizeHtml('<p style="color:red">Text</p>');
            expect(result).not.toContain('style=');
        });

        it('应该允许安全的 img 标签', () => {
            const result = sanitizeHtml('<img src="https://example.com/image.png" />');
            expect(result).toContain('<img');
            expect(result).toContain('src="https://example.com/image.png"');
        });
    });

    describe('stripHtml', () => {
        it('应该移除所有 HTML 标签', () => {
            const result = stripHtml('<p>Hello <b>World</b></p>');
            expect(result).toBe('Hello World');
        });

        it('应该处理无标签的文本', () => {
            const result = stripHtml('Plain text');
            expect(result).toBe('Plain text');
        });

        it('应该处理空字符串', () => {
            const result = stripHtml('');
            expect(result).toBe('');
        });

        it('应该处理嵌套标签', () => {
            const result = stripHtml('<div><span><a>Link</a></span></div>');
            expect(result).toBe('Link');
        });
    });
});
