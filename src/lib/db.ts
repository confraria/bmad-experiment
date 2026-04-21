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

export type PutTodoInput = { text: string } & Partial<Pick<Todo, 'id' | 'completed' | 'deletedAt'>>;

export async function putTodo(input: PutTodoInput): Promise<Todo> {
  const now = Date.now();
  const todo: Todo = TodoSchema.parse({
    id: input.id ?? newUlid(),
    clientId: getClientId(),
    text: input.text,
    completed: input.completed ?? false,
    createdAt: now,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  });
  await getDb().todos.put(todo);
  return todo;
}

export async function updateTodo(
  id: string,
  patch: Partial<Pick<Todo, 'text' | 'completed' | 'deletedAt'>>,
): Promise<Todo> {
  const db = getDb();
  const current = await db.todos.get(id);
  if (current === undefined) {
    throw new Error(`updateTodo: no todo with id ${id}`);
  }
  const next: Todo = TodoSchema.parse({
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
  await db.todos.put(next);
  return next;
}

export async function softDeleteTodo(id: string): Promise<void> {
  await updateTodo(id, { deletedAt: Date.now() });
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
