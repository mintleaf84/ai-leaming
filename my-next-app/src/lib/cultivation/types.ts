export type RealmTier =
  "凡人" | "炼气期" | "筑基期" | "金丹期" | "元婴期" | "化神期";
export type RealmStage = "前期" | "中期" | "后期" | "大圆满" | "";

export interface CultivationState {
  realm: RealmTier;
  stage: RealmStage;
  total修为: number; // 即 totalPracticed
  mastery: number; // 即 averageMastery
  progressToNext: number; // 到达下一境界的百分比
  description: string;
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  totalPracticed: number;
  averageMastery: number;
  cultivation: CultivationState;
}
