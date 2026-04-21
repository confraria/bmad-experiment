import { z } from 'zod';

export const TodoSchema = z.object({
  id: z.string().length(26),
  clientId: z.string().length(26),
  text: z.string().trim().min(1).max(1000),
  completed: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
});

export type Todo = z.infer<typeof TodoSchema>;

export const NewTodoInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export type NewTodoInput = z.infer<typeof NewTodoInputSchema>;
