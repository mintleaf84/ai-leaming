import { drizzleDb } from "@/lib/db";
import { mindmaps } from "@/lib/db/drizzle-schema";
import { eq, and, desc, sql, type InferSelectModel } from "drizzle-orm";

export type Mindmap = InferSelectModel<typeof mindmaps>;

export type CreateMindmapInput = {
  title?: string;
  content?: string;
};

export type UpdateMindmapInput = {
  id: number;
  title?: string;
  content?: string;
};

/**
 * 思维导图服务 - 处理 CRUD 与权限校验
 */
export const mindmapService = {
  /**
   * 创建新的思维导图
   */
  async create(userId: number, input: CreateMindmapInput = {}) {
    const {
      title = "未命名思维导图",
      content = "# 新建导图\n\n- 在此输入内容",
    } = input;

    const [result] = await drizzleDb
      .insert(mindmaps)
      .values({
        user_id: userId,
        title,
        content,
      })
      .returning({ id: mindmaps.id });

    return result.id;
  },

  /**
   * 更新思维导图 (带越权校验)
   */
  async update(userId: number, input: UpdateMindmapInput) {
    const { id, title, content } = input;

    // 1. 检查所有权
    const [existing] = await drizzleDb
      .select({ id: mindmaps.id })
      .from(mindmaps)
      .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, userId)))
      .limit(1);

    if (!existing) {
      throw new Error("脑图不存在或无权限修改");
    }

    // 2. 准备更新数据
    // updated_at 必须用 CURRENT_TIMESTAMP：与建表默认值/notes 保持同一格式
    // （`YYYY-MM-DD HH:MM:SS`）。历史上这里写 toISOString()，同一列混进两种格式，
    // 按字符串 desc 排序时同一天内 ISO 永远排在空格之后（"T" > " "），
    // 列表顺序会与真实更新时间不符
    const updateData = {
      updated_at: sql`CURRENT_TIMESTAMP`,
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    };

    // 3. 执行更新
    await drizzleDb
      .update(mindmaps)
      .set(updateData)
      .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, userId)));

    return true;
  },

  /**
   * 删除思维导图 (带越权校验)
   */
  async delete(userId: number, id: number) {
    const result = await drizzleDb
      .delete(mindmaps)
      .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, userId)));
    return result.rowsAffected > 0;
  },

  /**
   * 获取用户的思维导图列表 (简略模式)
   */
  async getList(userId: number) {
    return await drizzleDb
      .select({
        id: mindmaps.id,
        title: mindmaps.title,
        updated_at: mindmaps.updated_at,
      })
      .from(mindmaps)
      .where(eq(mindmaps.user_id, userId))
      .orderBy(desc(mindmaps.updated_at));
  },

  /**
   * 获取单个思维导图详情 (带越权校验)
   */
  async getDetail(userId: number, id: number): Promise<Mindmap> {
    const [record] = await drizzleDb
      .select()
      .from(mindmaps)
      .where(and(eq(mindmaps.id, id), eq(mindmaps.user_id, userId)))
      .limit(1);

    if (!record) {
      throw new Error("导图不存在或无权限查看");
    }

    return record as Mindmap;
  },
};
