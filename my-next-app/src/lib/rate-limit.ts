/**
 * Edge-compatible Rate Limiter (In-Memory)
 * 使用滑动窗口算法，适用于单实例部署
 * 生产环境多实例部署建议使用 Redis
 */

type RateLimitEntry = {
    count: number;
    resetTime: number;
};

// 内存存储（Edge Runtime 兼容）
const rateLimitStore = new Map<string, RateLimitEntry>();

// 配置
const RATE_LIMIT_CONFIG = {
    // 登录接口：每分钟最多 5 次（防暴力破解）
    '/api/auth/login': { limit: 5, windowMs: 60 * 1000 },
    // 注册接口：每分钟最多 3 次（防批量注册）
    '/api/auth/register': { limit: 3, windowMs: 60 * 1000 },
    // 默认：每分钟 30 次
    default: { limit: 30, windowMs: 60 * 1000 },
};

// 定期清理过期条目（防止内存泄漏）
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 1000; // 1 分钟清理一次

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;

    lastCleanup = now;
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}

export type RateLimitResult = {
    success: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
};

/**
 * 检查请求是否超过速率限制
 * @param identifier 唯一标识符（通常是 IP 地址）
 * @param path API 路径
 */
export function checkRateLimit(identifier: string, path: string): RateLimitResult {
    cleanup();

    const now = Date.now();
    const config = RATE_LIMIT_CONFIG[path as keyof typeof RATE_LIMIT_CONFIG] || RATE_LIMIT_CONFIG.default;
    const key = `${identifier}:${path}`;

    const entry = rateLimitStore.get(key);

    // 无记录或已过期 -> 创建新记录
    if (!entry || now > entry.resetTime) {
        rateLimitStore.set(key, {
            count: 1,
            resetTime: now + config.windowMs,
        });
        return {
            success: true,
            limit: config.limit,
            remaining: config.limit - 1,
            resetTime: now + config.windowMs,
        };
    }

    // 检查是否超限
    if (entry.count >= config.limit) {
        return {
            success: false,
            limit: config.limit,
            remaining: 0,
            resetTime: entry.resetTime,
        };
    }

    // 增加计数
    entry.count++;
    return {
        success: true,
        limit: config.limit,
        remaining: config.limit - entry.count,
        resetTime: entry.resetTime,
    };
}

/**
 * 获取客户端 IP 地址
 */
export function getClientIP(request: Request): string {
    // Cloudflare
    const cfIP = request.headers.get('cf-connecting-ip');
    if (cfIP) return cfIP;

    // X-Forwarded-For (代理/负载均衡)
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    // X-Real-IP (Nginx)
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;

    // 兜底
    return 'unknown';
}
