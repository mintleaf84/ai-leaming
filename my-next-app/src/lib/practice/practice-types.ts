/**
 * 练习系统类型定义
 * Practice System Type Definitions
 */

// 练习模式
export type PracticeMode =
    | 'smart'      // 智能刷题 (40/40/20)
    | 'review'     // 错题强化
    | 'focus'      // 专项突破
    | 'exam'       // 模拟考试
    | 'random';    // 随机挑战

// 练习模式中文映射
export const PRACTICE_MODE_LABELS: Record<PracticeMode, string> = {
    smart: '智能刷题',
    review: '错题强化',
    focus: '专项突破',
    exam: '模拟考试',
    random: '随机挑战'
};

// 练习模式描述
export const PRACTICE_MODE_DESCRIPTIONS: Record<PracticeMode, string> = {
    smart: '40% 顽固题 + 40% 盲区 + 20% 随机，AI 深度复盘',
    review: '专练历史错题，按错误次数排序',
    focus: '聚焦指定知识点或维度，精准突破',
    exam: '模拟真实考试，计时顺序作答，无提示',
    random: '完全随机抽题，快速查漏补缺'
};

// 练习模式图标 (Lucide 图标名)
export const PRACTICE_MODE_ICONS: Record<PracticeMode, string> = {
    smart: 'Brain',
    review: 'RotateCcw',
    focus: 'Target',
    exam: 'FileCheck',
    random: 'Shuffle'
};

// 认知维度
export type Dimension = 'knowledge' | 'understanding' | 'application';

// 维度中文映射
export const DIMENSION_LABELS: Record<Dimension, string> = {
    knowledge: '识记',
    understanding: '理解',
    application: '应用'
};

// 练习配置
export interface PracticeConfig {
    mode: PracticeMode;
    limit: number;                        // 题目数量
    types?: ('single' | 'multi')[];       // 题目类型筛选
    tags?: string[];                      // 知识点筛选
    dimensions?: Dimension[];             // 维度筛选
    enableReview?: boolean;               // 是否启用 AI 复盘 (默认 true)
    enableTimer?: boolean;                // 是否启用计时 (默认 false)
    shuffleOptions?: boolean;             // 是否打乱选项顺序 (默认 false)
}

// 默认配置
export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
    mode: 'smart',
    limit: 25,
    types: ['single', 'multi'],
    enableReview: true,
    enableTimer: false,
    shuffleOptions: false
};

// 预设配置
export const PRESET_CONFIGS: Record<PracticeMode, Partial<PracticeConfig>> = {
    smart: {
        limit: 25,
        enableReview: true,
        enableTimer: false
    },
    review: {
        limit: 20,
        enableReview: true,
        enableTimer: false
    },
    focus: {
        limit: 15,
        enableReview: true,
        enableTimer: false
    },
    exam: {
        limit: 50,
        enableReview: false,
        enableTimer: true
    },
    random: {
        limit: 10,
        enableReview: false,
        enableTimer: false
    }
};

// 题目数量选项
export const QUESTION_LIMIT_OPTIONS = [10, 15, 20, 25, 30, 50];
