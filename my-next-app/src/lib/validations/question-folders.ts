import { z } from "zod";

export const CreateFolderSchema = z.object({
  name: z.string().min(1, "文件夹名称不能为空").max(50, "名称过长"),
  color: z.string().optional(),
});

export const RenameFolderSchema = z.object({
  folderId: z.number(),
  name: z.string().min(1, "文件夹名称不能为空").max(50, "名称过长"),
});

export const DeleteFolderSchema = z.object({
  folderId: z.number(),
});

export const AddToFolderSchema = z.object({
  folderId: z.number(),
  questionIds: z.array(z.number()).min(1, "请选择至少一道题目"),
});

export const RemoveFromFolderSchema = z.object({
  folderId: z.number(),
  questionId: z.number(),
});

export const GetFolderQuestionsSchema = z.object({
  folderId: z.number(),
});
