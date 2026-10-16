"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { questionFeedbackService } from "@/lib/services/question-feedback-service";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const FeedbackSchema = z.object({
  questionId: z.number(),
  feedbackType: z.enum([
    "wrong_answer",
    "wrong_content",
    "wrong_explanation",
    "other",
  ]),
  description: z.string().max(500).optional(),
});

/**
 * 提交题目纠错反馈
 */
export const submitQuestionFeedbackAction = authenticatedAction
  .inputSchema(FeedbackSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const { questionId, feedbackType, description } = input;
    const { user } = ctx;

    try {
      const result = await questionFeedbackService.create({
        question_id: questionId,
        user_id: user.id,
        feedback_type: feedbackType,
        description,
      });

      revalidatePath("/history");
      return { success: true, id: result.id };
    } catch (error) {
      console.error("提交反馈失败:", error);
      return { success: false, message: "提交反馈失败，请稍后重试" };
    }
  });
