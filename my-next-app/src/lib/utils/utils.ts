import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化毫秒为可读时间
 * @param ms 毫秒数
 * @returns 格式化字符串，如 "9秒" 或 "1分30秒"
 */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds > 0 ? `${minutes}分${remainSeconds}秒` : `${minutes}分`;
}

/**
 * 将选项索引转换为字母
 * @param index 索引数字（0-25）
 * @returns 对应字母（A-Z）
 */
export function indexToLetter(index: number): string {
  if (index < 0 || index > 25) return String(index);
  return String.fromCharCode(65 + index); // A=65
}

/**
 * 格式化字节大小为可读字符串
 * @param bytes 字节数
 * @returns 格式化字符串，如 "1.5 KB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 格式化运行时长（秒）
 * @param seconds 运行秒数
 * @returns 格式化字符串，如 "1天2小时3分钟"
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);

  return parts.length > 0 ? parts.join("") : "刚刚启动";
}
