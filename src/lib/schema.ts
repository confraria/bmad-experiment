import { z } from 'zod';

const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ulid = () => z.string().regex(ULID_REGEX, 'invalid ULID');

export const TodoSchema = z
  .object({
    id: ulid(),
    clientId: ulid(),
    text: z.string().trim().min(1).max(1000),
    completed: z.boolean(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative().nullable(),
  })
  .refine((d) => d.updatedAt >= d.createdAt, {
    message: 'updatedAt precedes createdAt',
    path: ['updatedAt'],
  })
  .refine((d) => d.deletedAt === null || d.deletedAt >= d.createdAt, {
    message: 'deletedAt precedes createdAt',
    path: ['deletedAt'],
  });

export type Todo = z.infer<typeof TodoSchema>;

export const NewTodoInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export type NewTodoInput = z.infer<typeof NewTodoInputSchema>;

export const SyncPullQuerySchema = z.object({
  clientId: ulid(),
  since: z
    .string({ required_error: 'since is required' })
    .regex(/^\d+$/, 'since must be a non-negative integer')
    .transform((s) => Number(s))
    .pipe(z.number().int().nonnegative()),
});

export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;
