import { z } from 'zod';

/**
 * 题目列表过滤 Schema
 */
export const QuestionFiltersSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  dimension: z.enum(['knowledge', 'understanding', 'application']).optional(),
}).optional();

/**
 * 题目更新 Schema
 */
export const QuestionUpdateSchema = z.object({
  id: z.number(),
  data: z.object({
    content: z.string().optional(),
    options: z.array(z.string()).optional(),
    answer: z.string().optional(),
    explanation: z.string().optional(),
    tags: z.array(z.string()).optional(),
    dimension: z.enum(['knowledge', 'understanding', 'application']).optional(),
    type: z.enum(['single', 'multi', 'truefalse', 'fill_blank']).optional(),
  })
});

/**
 * 用户列表查询 Schema
 */
export const UserQuerySchema = z.object({
  limit: z.number().default(20),
  offset: z.number().default(0),
  query: z.string().default(''),
});

/**
 * 角色更新 Schema
 */
export const RoleUpdateSchema = z.object({
  id: z.number(),
  role: z.enum(['admin', 'student', 'teacher']),
});
