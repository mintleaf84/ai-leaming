import { z } from "zod";

/**
 * 保存 Prompt 模板的校验 Schema
 */
export const SavePromptSchema = z.object({
  key: z.string(),
  template: z.string(),
  description: z.string(),
  variables: z.array(z.string()),
});

/**
 * 调试 Prompt 的校验 Schema
 */
export const DebugPromptSchema = z.object({
  key: z.string(),
  template: z.string(),
  inputVariables: z.record(z.string()),
});
