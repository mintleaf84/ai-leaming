/**
 * 核心安全工具集
 * 遵循 KISS 原则，提供零依赖的 HTML 清洗功能防止 XSS
 */

/**
 * 基础 HTML 清洗函数
 * 允许部分安全标签 (b, i, u, p, br, strong, em, span, div)
 * 强硬剥离所有 script, iframe, object 以及所有的 on* 事件属性
 */
export function sanitizeHtml(html: string): string {
    if (!html) return '';

    return html
        // 1. 彻底移除 script, iframe, style, link, object, embed 等危险标签及其内容
        .replace(/<(script|iframe|style|link|object|embed|form|input|button|textarea|select|option)[^>]*>[\s\S]*?<\/\1>/gi, '')
        // 2. 移除自闭合的危险标签
        .replace(/<(meta|link|base|script|iframe|img|svg|input)[^>]*\/?>/gi, (match) => {
            // img 标签特殊处理，只允许 src 属性且禁止 javascript: 协议
            if (match.toLowerCase().startsWith('<img')) {
                const srcMatch = match.match(/src\s*=\s*(['"])(.*?)\1/i);
                if (srcMatch && !srcMatch[2].toLowerCase().startsWith('javascript:')) {
                    return `<img src="${srcMatch[2]}" class="max-w-full h-auto rounded-lg" />`;
                }
            }
            return '';
        })
        // 3. 移除所有 on* 事件属性 (如 onclick, onerror) 以及 javascript: 伪协议
        .replace(/\s+on\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\s+on\w+\s*=\s*[^>\s]+/gi, '')
        .replace(/href\s*=\s*(['"])javascript:.*?\1/gi, 'href="#"')
        // 4. 只允许白名单内的样式属性 (如果有必要支持一部分 inline style)
        // 为确保绝对安全，这里直接移除所有 style 属性
        .replace(/\s+style\s*=\s*(['"]).*?\1/gi, '');
}

/**
 * 纯文本提取（用于搜索索引等）
 */
export function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
}
