import { describe, it, expect } from 'vitest';
import { tiptapToMarkdown } from '../tiptapToMarkdown';

describe('tiptapToMarkdown', () => {
    it('应该正确转换基础标题和段落', () => {
        const input = JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: '标题' }]
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '这是一个段落' }]
                }
            ]
        });
        const result = tiptapToMarkdown(input);
        expect(result).toContain('# 标题');
        expect(result).toContain('这是一个段落');
    });

    it('应该正确转换无序列表', () => {
        const input = JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表项 1' }] }]
                        },
                        {
                            type: 'listItem',
                            content: [{ type: 'paragraph', content: [{ type: 'text', text: '列表项 2' }] }]
                        }
                    ]
                }
            ]
        });
        const result = tiptapToMarkdown(input);
        expect(result).toContain('- 列表项 1');
        expect(result).toContain('- 列表项 2');
    });

    it('如果解析失败应返回原始字符串', () => {
        const input = '不是 JSON 的文本';
        expect(tiptapToMarkdown(input)).toBe(input);
    });

    it('输入为空应返回空字符串', () => {
        expect(tiptapToMarkdown(null)).toBe('');
        expect(tiptapToMarkdown('')).toBe('');
    });
});
