export interface UserProfile {
  id: number;
  username: string;
  role: string;
  created_at: string;
  subscription: {
    plan_name: string;
    plan_id: string;
    status: string;
    expires_at: string | null;
    usage_today: Record<string, number>;
    limits: any;
  } | null;
  stats: {
    total_questions: number;
    correct_count: number;
    accuracy: number;
    practice_days: number;
    total_sessions: number;
    total_tags: number;
    mastered_tags: number;
    total_chats: number;
  };
}
