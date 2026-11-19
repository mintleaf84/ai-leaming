/**
 * 核心安全工具集。
 *
 * HTML 清洗**不再手写正则**：以前用黑名单正则剥 `<script>`/`on*`/`javascript:`，
 * 实测至少三种绕过（HTML 实体 `jav&#x61;script:`、前导空格、URL 里的制表符）——
 * 而浏览器解析器会把这些都还原成可执行地址。现在交给 DOMPurify（服务端用 jsdom、
 * 客户端用原生 DOM，同一套白名单）。
 */
import DOMPurify from "isomorphic-dompurify";

/**
 * 允许保留的标签：覆盖导入材料（粉笔/OCR/AI）实际会出现的排版，
 * 不包含 script/style/iframe/form/svg/math 等可执行或可混淆的容器。
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
];

/**
 * 允许保留的属性。
 *
 * 保留 `class`（现有正则本来也没剥它，剥了会让导入材料丢样式）；
 * **不保留** `style` 与所有事件属性 —— 前者可做 UI 伪装，后者就是 XSS 本体。
 */
const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "class",
  "colspan",
  "rowspan",
  "align",
];

/** 链接/图片只允许这些协议；`javascript:`「data:」等一律被 DOMPurify 丢弃 */
const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|tel:|#|\/)/i;

// 图片统一加响应式类名（与旧实现的可见效果一致）
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "IMG" && node.getAttribute("src")) {
    node.setAttribute("class", "max-w-full h-auto rounded-lg");
  }
});

/**
 * 清洗 HTML（用于 `dangerouslySetInnerHTML`）。
 *
 * 安全前提：**输入必须经过这里**。白名单之外的标签被移除、属性被剥离、
 * URI 按协议过滤；DOMPurify 会先做实体解码再判断，所以 `jav&#x61;script:` 这类
 * 编码绕过对它无效。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    // 明确禁止 <template> 之类的内容载体被还原
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "svg", "math"],
  });
}

/**
 * 把 HTML 压成纯文本（搜索、导出、题干摘要用）。
 *
 * 用 DOMPurify 去标签而不是正则：`<p>a < b</p>` 这类文本里带尖括号的内容，
 * 正则版会把 ` < b` 之后整段吞掉。实体（`&amp;` 等）在这里一并解码，
 * 与旧 `fenbi-parser` 里那份实现的行为对齐。
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const textOnly = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  return decodeEntities(textOnly);
}

/** 只处理清洗后仍会残留的少量实体（DOMPurify 会把文本节点序列化成转义形式） */
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  return value
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => named[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .trim();
}
