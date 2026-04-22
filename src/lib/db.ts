import Dexie, { type Table } from 'dexie';
import { getClientId } from './clientId';
import { TodoSchema, type Todo } from './schema';
import { newUlid } from './ulid';

const DB_NAME = 'bmad-experiment';

export class BmadDatabase extends Dexie {
  todos!: Table<Todo, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      todos: 'id, clientId, updatedAt, completed, deletedAt',
    });
  }
}

let instance: BmadDatabase | undefined;

export function getDb(): BmadDatabase {
  if (typeof window === 'undefined') {
    throw new Error(
      'getDb() must be called from a Client Component (window is undefined). ' +
        'Dexie opens an IndexedDB handle and cannot run under SSR.',
    );
  }
  if (instance === undefined) {
    instance = new BmadDatabase();
  }
  return instance;
}

function notifyMutation(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bmad:mutation'));
  }
}

export type PutTodoInput = { text: string } & Partial<Pick<Todo, 'id' | 'completed' | 'deletedAt'>>;

export async function putTodo(input: PutTodoInput): Promise<Todo> {
  const db = getDb();
  const now = Date.now();
  const id = input.id ?? newUlid();
  const existing = input.id !== undefined ? await db.todos.get(id) : undefined;
  const createdAt = existing?.createdAt ?? now;
  const todo: Todo = TodoSchema.parse({
    id,
    clientId: getClientId(),
    text: input.text,
    completed: input.completed ?? false,
    createdAt,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  });
  await db.todos.put(todo);
  notifyMutation();
  return todo;
}

export async function updateTodo(
  id: string,
  patch: Partial<Pick<Todo, 'text' | 'completed' | 'deletedAt'>>,
): Promise<Todo> {
  const db = getDb();
  const next = await db.transaction('rw', db.todos, async () => {
    const current = await db.todos.get(id);
    if (current === undefined) {
      throw new Error(`updateTodo: no todo with id ${id}`);
    }
    const isReviving = patch.deletedAt === null;
    if (current.deletedAt !== null && !isReviving) {
      throw new Error(`updateTodo: cannot mutate soft-deleted todo ${id}`);
    }
    const updated: Todo = TodoSchema.parse({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });
    await db.todos.put(updated);
    return updated;
  });
  notifyMutation();
  return next;
}

export async function softDeleteTodo(id: string): Promise<void> {
  const db = getDb();
  const mutated = await db.transaction('rw', db.todos, async () => {
    const current = await db.todos.get(id);
    if (current === undefined) {
      throw new Error(`softDeleteTodo: no todo with id ${id}`);
    }
    if (current.deletedAt !== null) return false;
    const next: Todo = TodoSchema.parse({
      ...current,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.todos.put(next);
    return true;
  });
  if (mutated) notifyMutation();
}

export async function resetDbForTests(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDbForTests is a test-only hook');
  }
  if (instance !== undefined) {
    instance.close();
    instance = undefined;
  }
  await Dexie.delete(DB_NAME);
}
