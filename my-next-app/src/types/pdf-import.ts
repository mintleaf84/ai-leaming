/** PDF 错题导入相关类型定义 */

/** AI 解析出的单道题目 */
export interface ParsedPdfQuestion {
  content: string;
  options: string[];
  type: "single" | "multi" | "truefalse";
  answer: string;
  explanation: string;
  confidence: number;
  tags: string[];
}

/** AI 解析完整结果 */
export interface ParsedPdfResult {
  questions: ParsedPdfQuestion[];
  parseWarnings: string[];
}

/** 预览数据（不写 DB） */
export interface PdfImportPreview {
  totalCount: number;
  questions: ParsedPdfQuestion[];
  parseWarnings: string[];
}

/** 最终导入结果 */
export interface PdfImportResult {
  success: boolean;
  importedCount: number;
  /** 因已存在（或批内重复）而跳过的题目数 —— 幂等重试时 importedCount 为 0、此项等于总数 */
  skippedCount: number;
  message: string;
}
