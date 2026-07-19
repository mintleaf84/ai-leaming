/**
 * 活动查询筛选参数
 */
export interface ActivityFilters {
  userId?: number;
  isCorrect?: boolean;
  search?: string;
}

/**
 * 用户活动流水条目
 */
export interface UserActivityEntry {
  id: number;
  user_id: number;
  username: string | null;
  question_id: number;
  question_content: string | null;
  dimension: string | null;
  user_answer: string | null;
  is_correct: boolean;
  duration_ms: number | null;
  timestamp: string | null;
}
