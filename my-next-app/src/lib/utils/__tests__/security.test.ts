import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripHtml } from '../security';

describe('sanitizeHtml（HTML 清洗）', () => {
    it('空字符串应返回空字符串', () => {
        expect(sanitizeHtml('')).toBe('');
    });

    it('null/undefined 应返回空字符串', () => {
        // @ts-expect-error 故意测试运行时传入 null 的边界行为
        expect(sanitizeHtml(null)).toBe('');
        // @ts-expect-error 故意测试运行时传入 undefined 的边界行为
        expect(sanitizeHtml(undefined)).toBe('');
    });

    it('应移除 <script> 标签及其内容', () => {
        const input = '<p>安全内容</p><script>alert("xss")</script>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('alert("xss")');
        expect(result).toContain('安全内容');
    });

    it('应移除 <iframe> 标签', () => {
        const input = '<p>正文</p><iframe src="evil.com"></iframe>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('<iframe');
        expect(result).toContain('正文');
    });

    it('应移除 onclick 等 on* 事件属性', () => {
        const input = '<button onclick="evil()">点击</button>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onclick');
        expect(result).not.toContain('evil()');
    });

    it('应移除 javascript: 伪协议的 href', () => {
        const input = '<a href="javascript:alert(1)">链接</a>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('javascript:');
    });

    it('应移除所有 style 属性', () => {
        const input = '<p style="color:red;background:url(evil)">文本</p>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('style=');
    });

    it('应保留普通文本内容', () => {
        const input = '<p>普通段落内容</p><b>加粗文本</b>';
        const result = sanitizeHtml(input);
        expect(result).toContain('普通段落内容');
        expect(result).toContain('加粗文本');
    });

    it('安全 img 标签的 src 应被保留（非 javascript: 协议）', () => {
        const input = '<img src="https://example.com/image.jpg">';
        const result = sanitizeHtml(input);
        expect(result).toContain('src="https://example.com/image.jpg"');
    });

    it('javascript: 协议的 img src 应被移除', () => {
        const input = '<img src="javascript:alert(1)">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('javascript:');
    });

    it('应移除 onerror 事件属性', () => {
        const input = '<img src="x" onerror="alert(1)">';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onerror');
    });
});

describe('stripHtml（纯文本提取）', () => {
    it('应移除所有 HTML 标签', () => {
        const input = '<p>这是<b>一段</b>文字</p>';
        expect(stripHtml(input)).toBe('这是一段文字');
    });

    it('空字符串应返回空字符串', () => {
        expect(stripHtml('')).toBe('');
    });

    it('纯文本应原样返回', () => {
        expect(stripHtml('没有标签的内容')).toBe('没有标签的内容');
    });

    it('应移除自闭合标签', () => {
        expect(stripHtml('文字<br/>更多文字')).toBe('文字更多文字');
    });

    it('应移除带属性的标签', () => {
        expect(stripHtml('<a href="http://example.com" class="link">链接文字</a>')).toBe('链接文字');
    });

    it('嵌套标签内的文本内容应保留', () => {
        const input = '<div><span><b>深层文本</b></span></div>';
        expect(stripHtml(input)).toBe('深层文本');
    });
});
