/**
 * 核心安全工具集
 * 遵循 KISS 原则，提供零依赖的 HTML 清洗功能防止 XSS
 */

const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'p', 'br', 'strong', 'em', 'span', 'div', 'ul', 'ol', 'li']);

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export function sanitizeHtml(html: string): string {
    if (!html) return '';

    const cleaned = html
        .replace(/<(script|iframe|style|link|object|embed|form|input|button|textarea|select|option|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(meta|link|base|script|iframe|svg|input)[^>]*\/?>/gi, '')
        .replace(/<img[^>]*\/?>/gi, (match) => {
            const srcMatch = match.match(/src\s*=\s*(['"])(.*?)\1/i);
            if (srcMatch) {
                const src = srcMatch[2].toLowerCase();
                const decodedSrc = decodeHtmlEntities(src);
                if (decodedSrc.startsWith('javascript:') || decodedSrc.startsWith('data:')) {
                    return '';
                }
                return `<img src="${srcMatch[2].replace(/["']/g, '')}" class="max-w-full h-auto rounded-lg" />`;
            }
            return '';
        })
        .replace(/<(\/?)(\w+)[^>]*\/?>/gi, (match, slash, tagName) => {
            if (ALLOWED_TAGS.has(tagName.toLowerCase())) {
                return `<${slash}${tagName}>`;
            }
            return '';
        })
        .replace(/href\s*=\s*(['"])(.*?)\1/gi, (match, quote, value) => {
            const decoded = decodeHtmlEntities(value.toLowerCase());
            if (decoded.startsWith('javascript:') || decoded.startsWith('data:')) {
                return 'href="#"';
            }
            return match;
        });

    return cleaned;
}

/**
 * 纯文本提取（用于搜索索引等）
 */
export function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
}
