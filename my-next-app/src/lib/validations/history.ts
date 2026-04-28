import { z } from "zod";

export const HistoryFilterSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
  mode: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  accuracyMin: z.number().optional(),
  accuracyMax: z.number().optional(),
});

export const RenameSessionSchema = z.object({
  sessionId: z.string(),
  newName: z.string().min(1),
});
