/** user_mastery 表行 */
export interface UserMasteryRow {
  tag_name: string;
  score: number;
  history: string;
  last_updated: string;
}

/** practice_logs 表行（备份相关字段） */
export interface PracticeLogBackupRow {
  session_id: string;
  question_id: number;
  user_answer: string;
  is_correct: number;
  is_monitored_correct: number;
  duration_ms: number;
  timestamp: string;
}

/** observation_zone 表行 */
export interface ObservationZoneRow {
  tag_name: string;
  reason: string;
  entered_at: string;
  status: "active" | "recovering" | "graduated";
}

export interface BackupData {
  version: number;
  timestamp: string;
  user_mastery: UserMasteryRow[];
  practice_logs: PracticeLogBackupRow[];
  observation_zone: ObservationZoneRow[];
}
