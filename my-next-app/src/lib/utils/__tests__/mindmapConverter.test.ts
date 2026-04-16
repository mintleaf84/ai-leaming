import { describe, it, expect } from 'vitest';
import { markdownToSmm } from '../mindmapConverter';

describe('markdownToSmm', () => {
    it('应该将基础 Markdown 转换为 SMM 格式', () => {
        const markdown = '# 根节点\n## 子节点 1\n## 子节点 2';
        const result = markdownToSmm(markdown);

        expect(result.data.text).toBe('根节点');
        expect(result.children).toHaveLength(2);
        expect(result.children[0].data.text).toBe('子节点 1');
        expect(result.children[1].data.text).toBe('子节点 2');
    });

    it('应该正确处理嵌套的层级', () => {
        const markdown = '# 根节点\n## 一级子节点\n### 二级子节点';
        const result = markdownToSmm(markdown);

        expect(result.data.text).toBe('根节点');
        expect(result.children[0].data.text).toBe('一级子节点');
        expect(result.children[0].children[0].data.text).toBe('二级子节点');
    });

    it('如果输入为空应返回默认值', () => {
        const result = markdownToSmm('');
        expect(result.data.text).toBe('核心主题');
    });

    it('如果 Markdown 只有标题，应该正确返回', () => {
        const result = markdownToSmm('# 仅标题');
        expect(result.data.text).toBe('仅标题');
        expect(result.children).toHaveLength(0);
    });

    it('应该处理包含 HTML 标签的内容 (如 <br>)', () => {
        const markdown = '# 标题\n## 第一行<br>第二行';
        const result = markdownToSmm(markdown);
        expect(result.children[0].data.text).toBe('第一行\n第二行');
    });
});
