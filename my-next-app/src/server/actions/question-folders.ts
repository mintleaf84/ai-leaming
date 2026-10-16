"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { questionFolderService } from "@/lib/services/question-folder";
import {
  CreateFolderSchema,
  RenameFolderSchema,
  DeleteFolderSchema,
  AddToFolderSchema,
  RemoveFromFolderSchema,
  GetFolderQuestionsSchema,
} from "@/lib/validations/question-folders";

/**
 * 获取用户所有文件夹
 */
export const getFoldersAction = authenticatedAction.action(async ({ ctx }) => {
  const { user } = ctx;
  const folders = await questionFolderService.getFolders(user.id);
  return { success: true, folders };
});

/**
 * 创建文件夹
 */
export const createFolderAction = authenticatedAction
  .inputSchema(CreateFolderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const folder = await questionFolderService.createFolder(
      user.id,
      parsedInput.name,
      parsedInput.color,
    );
    return { success: !!folder, folder };
  });

/**
 * 重命名文件夹
 */
export const renameFolderAction = authenticatedAction
  .inputSchema(RenameFolderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const result = await questionFolderService.renameFolder(
      user.id,
      parsedInput.folderId,
      parsedInput.name,
    );
    return { success: result };
  });

/**
 * 删除文件夹
 */
export const deleteFolderAction = authenticatedAction
  .inputSchema(DeleteFolderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const result = await questionFolderService.deleteFolder(
      user.id,
      parsedInput.folderId,
    );
    return { success: result };
  });

/**
 * 批量添加题目到文件夹
 */
export const addToFolderAction = authenticatedAction
  .inputSchema(AddToFolderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const added = await questionFolderService.addQuestions(
      user.id,
      parsedInput.folderId,
      parsedInput.questionIds,
    );
    return { success: added > 0, added };
  });

/**
 * 从文件夹移除题目
 */
export const removeFromFolderAction = authenticatedAction
  .inputSchema(RemoveFromFolderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const result = await questionFolderService.removeQuestion(
      user.id,
      parsedInput.folderId,
      parsedInput.questionId,
    );
    return { success: result };
  });

/**
 * 获取文件夹内的题目
 */
export const getFolderQuestionsAction = authenticatedAction
  .inputSchema(GetFolderQuestionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { user } = ctx;
    const questions = await questionFolderService.getQuestions(
      user.id,
      parsedInput.folderId,
    );
    return { success: true, questions };
  });
