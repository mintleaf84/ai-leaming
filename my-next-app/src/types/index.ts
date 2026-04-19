/**
 * 类型定义统一入口
 * Unified Type Definitions Entry Point
 * 
 * 所有类型都应从此文件导入：
 * import { User, Question, PracticeMode } from '@/types';
 */

// 用户类型
export type { User, UserRole, UserSession } from './user';

// 题目类型
export type {
    Question,
    QuestionRow,
    CorrectionQuiz,
    RegressionChallenge,
    Dimension,
    QuestionType,
} from './question';
export { DIMENSION_LABELS } from './question';

// 练习类型
export type {
    PracticeMode,
    PracticeConfig,
    ReviewStep,
    ReviewItem,
    PracticeState,
    PracticeAction,
} from './practice';
export {
    PRACTICE_MODE_LABELS,
    PRACTICE_MODE_DESCRIPTIONS,
    PRACTICE_MODE_ICONS,
    DEFAULT_PRACTICE_CONFIG,
    PRESET_CONFIGS,
    QUESTION_LIMIT_OPTIONS,
} from './practice';

// 订阅类型
export type {
    PlanTier,
    UsageType,
    SubscriptionPlan,
    UserSubscription,
    DailyUsage,
    PaymentRecord,
    UsageCheckResult,
    UserSubscriptionDetail,
} from './subscription';
export {
    USAGE_TYPE_LABELS,
    PLAN_TIER_LABELS,
    DEFAULT_PLANS,
} from './subscription';

// 管理员类型
export type {
    AdminAction,
    TargetType,
    AdminLogEntry,
} from './admin';
export {
    ADMIN_ACTION_LABELS,
    formatActionName,
} from './admin';

// Server Action 统一返回类型
export type { ActionResult } from './action-result';
export { ok, fail } from './action-result';
