import { drizzleDb as db, drizzleSchema as schema } from "@/lib/db";
import { eq, and, count, desc, sql } from "drizzle-orm";

export const questionFeedbackService = {
  async create(input: {
    question_id: number;
    user_id: number;
    feedback_type:
      "wrong_answer" | "wrong_content" | "wrong_explanation" | "other";
    description?: string;
  }) {
    const [row] = await db
      .insert(schema.question_feedback)
      .values({
        question_id: input.question_id,
        user_id: input.user_id,
        feedback_type: input.feedback_type,
        description: input.description ?? null,
      })
      .returning({ id: schema.question_feedback.id });
    return row;
  },

  async list(options: {
    limit: number;
    offset: number;
    status?: "pending" | "resolved" | "dismissed";
    feedback_type?: string;
  }) {
    const conditions = [];
    if (options.status) {
      conditions.push(eq(schema.question_feedback.status, options.status));
    }
    if (options.feedback_type) {
      conditions.push(
        eq(
          schema.question_feedback.feedback_type,
          options.feedback_type as
            "wrong_answer" | "wrong_content" | "wrong_explanation" | "other",
        ),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ total: count() })
      .from(schema.question_feedback)
      .where(where);

    const rows = await db
      .select({
        id: schema.question_feedback.id,
        question_id: schema.question_feedback.question_id,
        question_content: schema.questions.content,
        user_id: schema.question_feedback.user_id,
        username: schema.users.username,
        feedback_type: schema.question_feedback.feedback_type,
        description: schema.question_feedback.description,
        status: schema.question_feedback.status,
        created_at: schema.question_feedback.created_at,
        resolved_at: schema.question_feedback.resolved_at,
      })
      .from(schema.question_feedback)
      .leftJoin(
        schema.questions,
        eq(schema.question_feedback.question_id, schema.questions.id),
      )
      .leftJoin(
        schema.users,
        eq(schema.question_feedback.user_id, schema.users.id),
      )
      .where(where)
      .orderBy(desc(schema.question_feedback.created_at))
      .limit(options.limit)
      .offset(options.offset);

    return { items: rows, total: totalRow?.total ?? 0 };
  },

  async resolve(feedbackId: number, resolvedBy: number) {
    await db
      .update(schema.question_feedback)
      .set({
        status: "resolved",
        resolved_by: resolvedBy,
        resolved_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(schema.question_feedback.id, feedbackId));
  },

  async dismiss(feedbackId: number, resolvedBy: number) {
    await db
      .update(schema.question_feedback)
      .set({
        status: "dismissed",
        resolved_by: resolvedBy,
        resolved_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(schema.question_feedback.id, feedbackId));
  },

  async getStatusCounts() {
    const rows = await db
      .select({ status: schema.question_feedback.status, cnt: count() })
      .from(schema.question_feedback)
      .groupBy(schema.question_feedback.status);

    const result = { pending: 0, resolved: 0, dismissed: 0 };
    for (const row of rows) {
      if (row.status === "pending") result.pending = row.cnt;
      else if (row.status === "resolved") result.resolved = row.cnt;
      else if (row.status === "dismissed") result.dismissed = row.cnt;
    }
    return result;
  },
};
