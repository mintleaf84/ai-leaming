/** 支持的 OCR 模型标识符 */
export type OcrModel = "paddle-ocr" | "deepseek-ocr";

/** OCR 模型详细信息（供 UI 展示） */
export interface OcrModelInfo {
  id: OcrModel;
  name: string;
  description: string;
  supportedTypes: string[];
}
