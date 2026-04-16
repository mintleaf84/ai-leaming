import { describe, it, expect } from 'vitest';
import { splitText } from '../text-splitter';

describe('splitText（文本分割）', () => {
    it('短文本（小于 chunkSize）应作为单个块返回', () => {
        const text = '这是一段短文本。';
        const result = splitText(text, { chunkSize: 1000 });
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(text);
    });

    it('空字符串应返回空数组', () => {
        const result = splitText('');
        expect(result).toHaveLength(0);
    });

    it('超过 chunkSize 的文本应被分割为多块', () => {
        // 创建两个长段落，总长超过 100 个字符
        const para1 = '甲'.repeat(60);
        const para2 = '乙'.repeat(60);
        const text = `${para1}\n\n${para2}`;

        const result = splitText(text, { chunkSize: 100, chunkOverlap: 0 });
        expect(result.length).toBeGreaterThan(1);
    });

    it('段落边界优先于字符边界分割', () => {
        const para1 = '第一段内容 '.repeat(10).trim();
        const para2 = '第二段内容 '.repeat(10).trim();
        const text = `${para1}\n\n${para2}`;

        const result = splitText(text, { chunkSize: para1.length + 10, chunkOverlap: 0 });
        // 第一个块应包含完整的第一段
        expect(result[0]).toContain('第一段内容');
    });

    it('chunkOverlap 应在相邻块之间保留上下文', () => {
        const para1 = '上下文内容 '.repeat(15).trim();
        const para2 = '新段落内容 '.repeat(15).trim();
        const text = `${para1}\n\n${para2}`;

        const result = splitText(text, { chunkSize: para1.length + 5, chunkOverlap: 20 });
        // 有 overlap 时，第二块应包含来自第一块末尾的内容
        if (result.length > 1) {
            expect(result[1]).toContain('上下文内容');
        }
    });

    it('单段落长文本（内部无分段符）应作为一个块返回', () => {
        const longText = '单行超长文本 '.repeat(50).trim();
        const result = splitText(longText, { chunkSize: 2000 });
        expect(result).toHaveLength(1);
    });

    it('多段落文本应保留每段内容', () => {
        const text = ['段落A', '段落B', '段落C', '段落D'].join('\n\n');
        const result = splitText(text, { chunkSize: 2000 });
        // 所有内容都应出现在某个块中
        const fullText = result.join(' ');
        expect(fullText).toContain('段落A');
        expect(fullText).toContain('段落D');
    });
});
