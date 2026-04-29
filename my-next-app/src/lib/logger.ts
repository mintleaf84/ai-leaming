import pino from 'pino';
import { env } from '@/env';

// 根据环境区分日志级别和格式
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
    level: env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                ignore: 'pid,hostname', // 本地开发隐藏冗余字段
                translateTime: 'SYS:standard',
            },
        }
        : undefined, // 生产环境使用默认的 JSON 格式
    base: isDev ? undefined : { env: process.env.NODE_ENV }, // 生产环境添加基础 metadata
    formatters: {
        level: (label: string) => {
            return { level: label }; // 使用字符串 level 而不是数字
        },
    },
});

export default logger;
