import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, asc, sql } from "drizzle-orm";
import {
  DEFAULT_CORRECTION_PROMPT,
  DEFAULT_REGRESSION_PROMPT,
  DEFAULT_KNOWLEDGE_EXTRACT_PROMPT,
  DEFAULT_CHAT_SYSTEM_PROMPT,
  PROMPT_VARIABLE_EXAMPLES,
} from "@/lib/ai/prompts";

export interface PromptTemplate {
  key: string;
  template: string;
  description: string;
  variables: string[];
  updated_at?: string;
  systemDefault?: string;
  variableExamples?: Record<string, string>;
}

/**
 * 提示词服务 - 管理 AI 提示词模板
 */
export const promptService = {
  /**
   * 获取所有 Prompt 模板（数据库覆盖 + 系统默认）
   */
  async getAllTemplates(): Promise<PromptTemplate[]> {
    const rows = await drizzleDb
      .select()
      .from(drizzleSchema.prompt_templates)
      .orderBy(asc(drizzleSchema.prompt_templates.key));

    const dbRows: PromptTemplate[] = rows.map((row) => ({
      ...row,
      description: row.description ?? "",
      updated_at: row.updated_at ?? undefined,
      variables: JSON.parse(row.variables || "[]") as string[],
    }));

    const existingKeys = new Set(dbRows.map((r) => r.key));
    const defaults = [
      {
        key: "correction_quiz",
        template: DEFAULT_CORRECTION_PROMPT,
        description: "纠偏找茬 (Correction Quiz)",
        variables: ["questionContent", "wrongAnswer", "correctAnswer"],
      },
      {
        key: "regression_challenge",
        template: DEFAULT_REGRESSION_PROMPT,
        description: "回归挑战 (Regression Challenge)",
        variables: ["questionContent", "tags"],
      },
      {
        key: "knowledge_extract",
        template: DEFAULT_KNOWLEDGE_EXTRACT_PROMPT,
        description: "知识卡片提取 (Knowledge Card Extraction)",
        variables: ["content"],
      },
      {
        key: "chat_system",
        template: DEFAULT_CHAT_SYSTEM_PROMPT,
        description: "AI 聊天辅助 (Chat System)",
        variables: [],
      },
    ];

    const combined: PromptTemplate[] = [...dbRows];

    for (const def of defaults) {
      if (!existingKeys.has(def.key)) {
        combined.push({
          key: def.key,
          template: "",
          description: def.description,
          variables: def.variables,
          updated_at: new Date().toISOString(),
          systemDefault: def.template,
          variableExamples: PROMPT_VARIABLE_EXAMPLES[def.key] || {},
        });
      } else {
        const row = combined.find((r) => r.key === def.key);
        if (row) {
          row.systemDefault = def.template;
          row.variableExamples = PROMPT_VARIABLE_EXAMPLES[def.key] || {};
        }
      }
    }

    return combined as PromptTemplate[];
  },

  /**
   * 更新模板
   */
  async upsertTemplate(
    key: string,
    template: string,
    description: string,
    variables: string[],
  ) {
    await drizzleDb
      .insert(drizzleSchema.prompt_templates)
      .values({
        key,
        template,
        description,
        variables: JSON.stringify(variables),
      })
      .onConflictDoUpdate({
        target: drizzleSchema.prompt_templates.key,
        set: {
          template,
          description,
          variables: JSON.stringify(variables),
          updated_at: sql`CURRENT_TIMESTAMP`,
        },
      });
    return true;
  },

  /**
   * 删除模板 (重置为默认)
   */
  async deleteTemplate(key: string) {
    await drizzleDb
      .delete(drizzleSchema.prompt_templates)
      .where(eq(drizzleSchema.prompt_templates.key, key));
    return true;
  },
};
