/** 用户个人资料类型 */
export interface UserProfile {
    id: number;
    email: string | null;
    name: string | null;
    image: string | null;
    role: string | null;
    createdAt: string;
    updatedAt: string;
}

/** 用户设置项 */
export interface UserSettings {
    theme?: 'light' | 'dark' | 'system';
    readingSpeed?: number;
    [key: string]: any;
}
