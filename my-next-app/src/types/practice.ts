/**
 * 练习系统类型定义
 * Practice System Type Definitions
 */
import type { Question, CorrectionQuiz, RegressionChallenge, Dimension } from './question';

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

// 练习配置
export interface PracticeConfig {
    mode: PracticeMode;
    limit: number;                                       // 题目数量
    types?: ('single' | 'multi' | 'truefalse')[];        // 题目类型筛选
    tags?: string[];                                     // 知识点筛选
    dimensions?: Dimension[];                            // 维度筛选
    enableReview?: boolean;                              // 是否启用 AI 复盘 (默认 true)
    enableTimer?: boolean;                               // 是否启用计时 (默认 false)
    shuffleOptions?: boolean;                            // 是否打乱选项顺序 (默认 false)
}

// 默认配置
export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
    mode: 'smart',
    limit: 25,
    types: ['single', 'multi', 'truefalse'],
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

// 复盘步骤
export type ReviewStep = 'study' | 'quiz' | 'regression';

// 复盘项目
export interface ReviewItem {
    originalQuestionId: number;
    originalQuestionContent: string;
    wrongAnswer: string;
    tags: string[];

    // Generated Content
    studyContent?: string; // From RAG
    quiz?: CorrectionQuiz;
    regression?: RegressionChallenge;

    // Progress
    currentStep: ReviewStep;
    regressionSubIndex: number; // For the 3-question regression challenge
    failedAttempts: number; // For melting logic (3 strikes)
}

// 练习状态
export interface PracticeState {
    status: 'loading' | 'idle' | 'practicing' | 'reviewing' | 'finished' | 'error';
    sessionId: string | null;

    // Standard Practice
    sessionQueue: Question[];
    currentIndex: number;
    startTime: number; // For duration tracking
    answers: Record<number, { answer: string; isCorrect: boolean; duration: number }>;

    // Review Logic
    reviewQueue: ReviewItem[];
    currentReviewIndex: number;
    reviewTriggeredAt: number; // e.g., 25
}

// 练习状态机 Action
export type PracticeAction =
    | { type: 'INIT_SESSION'; payload: { questions: Question[]; sessionId: string; startIndex?: number } }
    | { type: 'ANSWER_QUESTION'; payload: { questionId: number; answer: string; isCorrect: boolean; duration: number } }
    | { type: 'TRIGGER_REVIEW' }
    | { type: 'LOAD_REVIEW_DATA'; payload: { index: number; data: Partial<ReviewItem> } }
    | { type: 'COMPLETE_REVIEW_STEP'; payload: { success: boolean } }
    | { type: 'NEXT_REVIEW_ITEM' }
    | { type: 'RESUME_PRACTICE' }
    | { type: 'FINISH_SESSION' };
