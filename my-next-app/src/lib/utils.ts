import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
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
    return String.fromCharCode(65 + index);  // A=65
}
