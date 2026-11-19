// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml } from "../security";

describe("Security Utils", () => {
  describe("sanitizeHtml", () => {
    it("应该移除 script 标签", () => {
      const result = sanitizeHtml("<p>Hello</p><script>alert(1)</script>");
      expect(result).not.toContain("<script>");
    });

    it("应该移除 iframe 标签", () => {
      const result = sanitizeHtml('<p>Test</p><iframe src="evil"></iframe>');
      expect(result).not.toContain("<iframe");
    });

    it("应该移除 onclick 事件属性", () => {
      const result = sanitizeHtml(
        '<a href="https://example.com" onclick="alert(1)">Click</a>',
      );
      expect(result).toContain("<a");
      expect(result).not.toContain("onclick");
    });

    it("应该移除 onerror 事件属性", () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain("onerror");
    });

    it("应该阻止 javascript: 伪协议", () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">Link</a>');
      expect(result).not.toContain("javascript:");
    });

    // ---- 旧正则实现的四种真实绕过（2026-11 审计时实测可穿过）----
    // 这些用例的价值在于：换实现后如果又退回"黑名单正则"，它们会立刻红。
    it.each([
      ["实体编码的协议", '<a href="jav&#x61;script:alert(1)">x</a>'],
      ["前导空格的协议", '<a href="  javascript:alert(1)">x</a>'],
      ["URL 里的制表符", '<a href="java\tscript:alert(1)">x</a>'],
      ["冒号实体编码", '<a href="javascript&#58;alert(1)">x</a>'],
      ["大小写混合", '<a href="JaVaScRiPt:alert(1)">x</a>'],
    ])("必须拦住绕过：%s", (_label, payload) => {
      const result = sanitizeHtml(payload);
      const normalized = result.toLowerCase().replace(/[\s\t\n]/g, "");
      expect(normalized).not.toContain("javascript:");
      expect(result).not.toContain("alert(1)");
    });

    it("保留材料题需要的排版标签，但丢掉 style/svg/math", () => {
      const result = sanitizeHtml(
        '<div style="position:fixed">a</div><svg><circle/></svg><math><mi>x</mi></math><table><tr><td>b</td></tr></table>',
      );
      expect(result).toContain("<div");
      expect(result).not.toContain("style=");
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("<math");
      expect(result).toContain("<table>");
    });

    it("图片保留 src 并统一加响应式类名", () => {
      const result = sanitizeHtml('<img src="https://x.test/a.png" alt="a">');
      expect(result).toContain('src="https://x.test/a.png"');
      expect(result).toContain("max-w-full");
    });

    it("应该保留安全的标签", () => {
      const result = sanitizeHtml("<p>Hello <b>World</b></p>");
      expect(result).toContain("<p>");
      expect(result).toContain("<b>");
    });

    it("应该处理空字符串", () => {
      const result = sanitizeHtml("");
      expect(result).toBe("");
    });

    it("应该处理 null 输入", () => {
      const result = sanitizeHtml(null as any);
      expect(result).toBe("");
    });

    it("应该移除 style 属性", () => {
      const result = sanitizeHtml('<p style="color:red">Text</p>');
      expect(result).not.toContain("style=");
    });

    it("应该允许安全的 img 标签", () => {
      const result = sanitizeHtml(
        '<img src="https://example.com/image.png" />',
      );
      expect(result).toContain("<img");
      expect(result).toContain('src="https://example.com/image.png"');
    });
  });

  describe("stripHtml", () => {
    it("应该移除所有 HTML 标签", () => {
      const result = stripHtml("<p>Hello <b>World</b></p>");
      expect(result).toBe("Hello World");
    });

    it("应该处理无标签的文本", () => {
      const result = stripHtml("Plain text");
      expect(result).toBe("Plain text");
    });

    it("应该处理空字符串", () => {
      const result = stripHtml("");
      expect(result).toBe("");
    });

    it("应该处理嵌套标签", () => {
      const result = stripHtml("<div><span><a>Link</a></span></div>");
      expect(result).toBe("Link");
    });
  });
});
