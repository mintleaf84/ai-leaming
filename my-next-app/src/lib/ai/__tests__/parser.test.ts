import { describe, it, expect } from 'vitest';
import { extractJson, autoUnpackNestedJson } from '../parser';

describe('ai-parser', () => {
    describe('extractJson', () => {
        it('应该解析标准的 JSON 字符串', () => {
            const input = '{"name": "test", "value": 123}';
            const result = extractJson(input);
            expect(result).toEqual({ name: "test", value: 123 });
        });

        it('应该从 Markdown 代码块中提取 JSON', () => {
            const input = '好的，这是结果：\n```json\n{"score": 85, "label": "good"}\n```\n希望对你有帮助。';
            const result = extractJson(input);
            expect(result).toEqual({ score: 85, label: "good" });
        });

        it('应该移除 DeepSeek 的 <think> 标签内容', () => {
            const input = '<think>\n用户想要一个 JSON。\n我应该返回正确的格式。\n</think>\n```json\n{"result": "ok"}\n```';
            const result = extractJson(input);
            expect(result).toEqual({ result: "ok" });
        });

        it('应该过滤非法的控制字符', () => {
            // 模拟包含非法控制字符的 JSON
            const input = '{"text": "hello\u0001world"}';
            const result = extractJson(input);
            expect(result).toEqual({ text: "helloworld" });
        });

        it('应该在 JSON 混在杂乱文本中时通过大括号定位提取', () => {
            const input = '这里是一些前缀文字 { "id": 1, "status": "active" } 这里是一些后缀文字';
            const result = extractJson(input);
            expect(result).toEqual({ id: 1, status: "active" });
        });

        it('当找不到有效 JSON 时应该抛出错误', () => {
            const input = '这是一段完全没有 JSON 的文字';
            expect(() => extractJson(input)).toThrow('无法从响应中提取有效的 JSON 格式');
        });
    });

    describe('autoUnpackNestedJson', () => {
        it('当对象包含预期的 key 时不应解包', () => {
            const input = { analysis: "foo", score: 10 };
            const result = autoUnpackNestedJson(input, ['analysis']);
            expect(result).toBe(input);
        });

        it('当对象只有一个不相关的 key 且值是对象时应该解包', () => {
            const input = { result: { analysis: "foo", score: 10 } };
            const result = autoUnpackNestedJson(input, ['analysis']);
            expect(result).toEqual({ analysis: "foo", score: 10 });
        });

        it('当对象有多个 key 时不应解包', () => {
            const input = { result: { a: 1 }, other: 2 };
            const result = autoUnpackNestedJson(input, ['analysis']);
            expect(result).toBe(input);
        });
    });
});
