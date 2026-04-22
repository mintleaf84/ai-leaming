import { describe, it, expect } from 'vitest';
import { extractJson, autoUnpackNestedJson } from '../parser';

describe('AI Parser - extractJson', () => {
    it('应该能解析纯 JSON 字符串', () => {
        const input = '{"a": 1, "b": "test"}';
        expect(extractJson(input)).toEqual({ a: 1, b: "test" });
    });

    it('应该能从 Markdown 代码块中提取 JSON', () => {
        const input = '这里是结果：\n```json\n{"result": "ok"}\n```\n请查收。';
        expect(extractJson(input)).toEqual({ result: "ok" });
    });

    it('应该能移除 DeepSeek 的 <think> 标签', () => {
        const input = '<think>\n思考中...\n</think>\n{"answer": "42"}';
        expect(extractJson(input)).toEqual({ answer: "42" });
    });

    it('应该能处理包含非法控制字符的 JSON', () => {
        // 包含 \u0001 等控制字符
        const input = '{"text": "hello\u0001world"}';
        expect(extractJson(input)).toEqual({ text: "helloworld" });
    });

    it('应该能从非标准文本中提取第一个 JSON 对象', () => {
        const input = 'Random text before {"key": "val"} random text after';
        expect(extractJson(input)).toEqual({ key: "val" });
    });

    it('如果完全没有 JSON 应该抛出错误', () => {
        const input = '这段文字里没有任何 json 对象';
        expect(() => extractJson(input)).toThrow('无法从响应中提取有效的 JSON 格式');
    });
});

describe('AI Parser - autoUnpackNestedJson', () => {
    it('如果对象只有一层冗余嵌套，应该自动解包', () => {
        const input = { result: { score: 100, comment: "good" } };
        const result = autoUnpackNestedJson(input, ['score', 'comment']);
        expect(result).toEqual({ score: 100, comment: "good" });
    });

    it('如果是预期的 Key，不应该解包', () => {
        const input = { quiz: { content: "q" } };
        const result = autoUnpackNestedJson(input, ['quiz']);
        expect(result).toEqual({ quiz: { content: "q" } });
    });
});
