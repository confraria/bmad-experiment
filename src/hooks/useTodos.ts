'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import type { Todo } from '@/lib/schema';

export function useTodos(): Todo[] | undefined {
  return useLiveQuery(async () =>
    getDb()
      .todos.orderBy('id')
      .reverse()
      .filter((t) => t.deletedAt === null)
      .toArray(),
  );
}
