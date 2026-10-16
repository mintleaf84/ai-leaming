/**
 * 核心安全工具集
 * 遵循 KISS 原则，提供零依赖的 HTML 清洗功能防止 XSS
 */

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  return html
    .replace(
      /<(script|iframe|style|link|object|embed|form|input|button|textarea|select|option|svg)[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    )
    .replace(
      /<(meta|link|base|script|iframe|img|svg|input)[^>]*\/?>/gi,
      (match) => {
        if (match.toLowerCase().startsWith("<img")) {
          const srcMatch = match.match(/src\s*=\s*(['"])(.*?)\1/i);
          if (
            srcMatch &&
            !srcMatch[2].toLowerCase().startsWith("javascript:")
          ) {
            return `<img src="${srcMatch[2]}" class="max-w-full h-auto rounded-lg" />`;
          }
        }
        return "";
      },
    )
    .replace(/\s+on\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s+on\w+\s*=\s*[^>\s]+/gi, "")
    .replace(/href\s*=\s*(['"])javascript:.*?\1/gi, 'href="#"')
    .replace(/\s+style\s*=\s*(['"]).*?\1/gi, "");
}

/**
 * 纯文本提取（用于搜索索引等）
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
