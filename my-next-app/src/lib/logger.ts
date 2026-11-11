import pino from "pino";
import { env } from "@/env";

// 根据环境区分日志级别和格式
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname", // 本地开发隐藏冗余字段
          translateTime: "SYS:standard",
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

/**
 * 服务端日志迁移垫片。
 *
 * 历史代码大量使用 `console.error("xxx", err)`；pino 的签名是
 * `logger.error(obj, msg)`，直接替换会丢掉随附对象。这里保留 console 的调用
 * 形态，把附加参数归一化为结构化字段（Error 归到 `err`，其余归到 `args`），
 * 从而可以机械替换、不改变控制流。
 *
 * 新代码请直接使用 `logger.error({ err, ...ctx }, "message")`。
 */
function normalizeRest(rest: unknown[]) {
  const err = rest.find((r) => r instanceof Error);
  if (err) {
    const others = rest.filter((r) => r !== err);
    return others.length > 0 ? { err, args: others } : { err };
  }
  return rest.length > 0 ? { args: rest } : {};
}

export const log = {
  error: (message: unknown, ...rest: unknown[]) =>
    logger.error(normalizeRest(rest), String(message)),
  warn: (message: unknown, ...rest: unknown[]) =>
    logger.warn(normalizeRest(rest), String(message)),
  info: (message: unknown, ...rest: unknown[]) =>
    logger.info(normalizeRest(rest), String(message)),
  debug: (message: unknown, ...rest: unknown[]) =>
    logger.debug(normalizeRest(rest), String(message)),
};
