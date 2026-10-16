/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  sessionId?: string;
  importedCount: number;
  newQuestionsCount: number;
  skippedQuestionsCount: number;
  message: string;
}
