"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { WELCOME_NOTE_CONTENT } from "@/lib/content/welcome";
import { knowledgeService } from "@/lib/services/knowledge";

/**
 * 创建欢迎笔记
 */
export const createWelcomeNoteAction = authenticatedAction.action(
  async ({ ctx }) => {
    const { user } = ctx;
    const noteId = await knowledgeService.createNote(
      user.id,
      "👋 欢迎使用智能笔记",
      JSON.stringify(WELCOME_NOTE_CONTENT),
    );
    revalidatePath("/notes");
    return { success: true, noteId };
  },
);

/**
 * 创建笔记
 */
export const createNoteAction = authenticatedAction
  .inputSchema(
    z
      .object({
        title: z.string().optional(),
        content: z.string().optional(),
      })
      .default({}),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const { user } = ctx;
    const noteId = await knowledgeService.createNote(
      user.id,
      input.title,
      input.content,
    );

    revalidatePath("/notes");
    return { success: true, noteId, message: "笔记已创建" };
  });

/**
 * 更新笔记
 */
export const updateNoteAction = authenticatedAction
  .inputSchema(
    z.object({
      id: z.number().int(),
      title: z.string().optional(),
      content: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const { user } = ctx;
    try {
      await knowledgeService.updateNote(user.id, input.id, {
        title: input.title,
        content: input.content,
      });
      revalidatePath("/notes");
      revalidatePath(`/notes/${input.id}`);
      return { success: true, message: "笔记已更新" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "更新失败",
      };
    }
  });

/**
 * 删除笔记
 */
export const deleteNoteAction = authenticatedAction
  .inputSchema(z.number().int())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    await knowledgeService.deleteNote(user.id, id);

    revalidatePath("/notes");
    return { success: true, message: "笔记已删除" };
  });

/**
 * 获取笔记列表
 */
export const getNotesAction = authenticatedAction.action(async ({ ctx }) => {
  const { user } = ctx;
  const notes = await knowledgeService.getNoteList(user.id);
  return { success: true, notes };
});

/**
 * 获取笔记详情
 */
export const getNoteDetailAction = authenticatedAction
  .inputSchema(z.number().int())
  .action(async ({ parsedInput: id, ctx }) => {
    const { user } = ctx;
    const note = await knowledgeService.getNoteDetail(user.id, id);
    return { success: true, note };
  });

/**
 * 搜索笔记
 */
export const searchNotesAction = authenticatedAction
  .inputSchema(z.string())
  .action(async ({ parsedInput: query, ctx }) => {
    const { user } = ctx;
    if (!query.trim()) {
      const notes = await knowledgeService.getNoteList(user.id);
      return { success: true, notes };
    }
    const notes = await knowledgeService.searchNotes(user.id, query);
    return { success: true, notes };
  });
