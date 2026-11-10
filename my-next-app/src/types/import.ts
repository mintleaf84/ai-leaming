/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  sessionId?: string;
  importedCount: number;
  newQuestionsCount: number;
  skippedQuestionsCount: number;
  duplicated?: boolean; // 同一来源重复导入时为 true（未写入任何数据）
  message: string;
}
