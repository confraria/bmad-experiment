import { describe, it, expect } from 'vitest';
import {
  TodoSchema,
  NewTodoInputSchema,
  SyncPullQuerySchema,
  SyncPushBodySchema,
  ErrorReportSchema,
} from '../schema';

const validTodo = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  clientId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  text: 'buy milk',
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null as number | null,
};

describe('TodoSchema', () => {
  it('accepts a well-formed Todo (P0)', () => {
    const parsed = TodoSchema.parse(validTodo);
    expect(parsed).toEqual(validTodo);
  });

  it('rejects empty text', () => {
    expect(() => TodoSchema.parse({ ...validTodo, text: '' })).toThrow();
  });

  it('rejects whitespace-only text after trim', () => {
    expect(() => TodoSchema.parse({ ...validTodo, text: '   ' })).toThrow();
  });

  it('rejects text over 1000 characters', () => {
    expect(() => TodoSchema.parse({ ...validTodo, text: 'a'.repeat(1001) })).toThrow();
  });

  it('rejects non-string text', () => {
    expect(() => TodoSchema.parse({ ...validTodo, text: 123 as unknown as string })).toThrow();
  });

  it('rejects missing clientId', () => {
    const withoutClientId: Record<string, unknown> = { ...validTodo };
    delete withoutClientId.clientId;
    expect(() => TodoSchema.parse(withoutClientId)).toThrow();
  });

  it('rejects non-numeric timestamps', () => {
    expect(() =>
      TodoSchema.parse({ ...validTodo, createdAt: '2026-01-01' as unknown as number }),
    ).toThrow();
    expect(() =>
      TodoSchema.parse({ ...validTodo, updatedAt: new Date() as unknown as number }),
    ).toThrow();
  });

  it('rejects negative timestamps', () => {
    expect(() => TodoSchema.parse({ ...validTodo, createdAt: -1 })).toThrow();
  });

  it('rejects deletedAt: undefined (must be null or number)', () => {
    expect(() =>
      TodoSchema.parse({ ...validTodo, deletedAt: undefined as unknown as number | null }),
    ).toThrow();
  });

  it('accepts deletedAt as null', () => {
    expect(() => TodoSchema.parse({ ...validTodo, deletedAt: null })).not.toThrow();
  });

  it('accepts deletedAt as a number', () => {
    expect(() => TodoSchema.parse({ ...validTodo, deletedAt: 1_700_000_000_001 })).not.toThrow();
  });

  it('rejects id/clientId that are not 26 chars', () => {
    expect(() => TodoSchema.parse({ ...validTodo, id: 'short' })).toThrow();
    expect(() =>
      TodoSchema.parse({ ...validTodo, clientId: '01ARZ3NDEKTSV4RRFFQ69G5FAVEXTRA' }),
    ).toThrow();
  });

  it('trims text on parse', () => {
    const parsed = TodoSchema.parse({ ...validTodo, text: '  hello  ' });
    expect(parsed.text).toBe('hello');
  });
});

describe('NewTodoInputSchema', () => {
  it('trims and accepts valid input', () => {
    const parsed = NewTodoInputSchema.parse({ text: '  buy eggs  ' });
    expect(parsed.text).toBe('buy eggs');
  });

  it('rejects empty post-trim text', () => {
    expect(() => NewTodoInputSchema.parse({ text: '   ' })).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => NewTodoInputSchema.parse({ text: '' })).toThrow();
  });

  it('rejects text over 1000 chars', () => {
    expect(() => NewTodoInputSchema.parse({ text: 'a'.repeat(1001) })).toThrow();
  });
});

describe('SyncPullQuerySchema', () => {
  const validClientId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

  it('accepts valid clientId and numeric string since', () => {
    const parsed = SyncPullQuerySchema.parse({ clientId: validClientId, since: '1700000000000' });
    expect(parsed.clientId).toBe(validClientId);
    expect(parsed.since).toBe(1_700_000_000_000);
  });

  it('accepts since=0 for full initial sync', () => {
    const parsed = SyncPullQuerySchema.parse({ clientId: validClientId, since: '0' });
    expect(parsed.since).toBe(0);
  });

  it('rejects since as a number (must be a string from query params)', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: validClientId, since: 42 })).toThrow();
  });

  it('rejects missing clientId', () => {
    expect(() => SyncPullQuerySchema.parse({ since: '0' })).toThrow();
  });

  it('rejects missing since', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: validClientId })).toThrow();
  });

  it('rejects non-ULID clientId', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: 'not-a-ulid', since: '0' })).toThrow();
  });

  it('rejects negative since', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: validClientId, since: '-5' })).toThrow();
  });

  it('rejects float since', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: validClientId, since: '1.5' })).toThrow();
  });

  it('rejects unparseable since', () => {
    expect(() => SyncPullQuerySchema.parse({ clientId: validClientId, since: 'abc' })).toThrow();
  });
});

describe('SyncPushBodySchema', () => {
  const clientId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const otherClientId = '01ARZ3NDEKTSV4RRFFQ69G5FAX';

  const makeTodo = (overrides: Partial<typeof validTodo> = {}) => ({
    ...validTodo,
    clientId,
    ...overrides,
  });

  it('accepts a valid batch with matching clientIds', () => {
    const parsed = SyncPushBodySchema.parse({
      clientId,
      todos: [makeTodo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })],
    });
    expect(parsed.todos).toHaveLength(1);
  });

  it('accepts an empty todos array', () => {
    const parsed = SyncPushBodySchema.parse({ clientId, todos: [] });
    expect(parsed.todos).toEqual([]);
  });

  // ULID alphabet: Crockford Base32, first char must be [0-7]
  const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const genUlid = (i: number): string => {
    const base = '01ARZ3NDEKTSV4RRFFQ69G5FAV'.split('');
    // vary last 5 chars based on i
    for (let k = 0; k < 5; k++) {
      base[25 - k] = ULID_CHARS[(i >> (k * 5)) & 0x1f];
    }
    return base.join('');
  };

  it('accepts a batch at the 500-todo boundary', () => {
    const todos = Array.from({ length: 500 }, (_, i) => makeTodo({ id: genUlid(i) }));
    expect(() => SyncPushBodySchema.parse({ clientId, todos })).not.toThrow();
  });

  it('rejects a batch over 500 todos', () => {
    const todos = Array.from({ length: 501 }, (_, i) => makeTodo({ id: genUlid(i) }));
    expect(() => SyncPushBodySchema.parse({ clientId, todos })).toThrow();
  });

  it('rejects a batch where any todo.clientId differs from body.clientId', () => {
    expect(() =>
      SyncPushBodySchema.parse({
        clientId,
        todos: [
          makeTodo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
          makeTodo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FA0', clientId: otherClientId }),
        ],
      }),
    ).toThrow();
  });

  it('rejects a non-ULID body clientId', () => {
    expect(() =>
      SyncPushBodySchema.parse({ clientId: 'not-a-ulid', todos: [] }),
    ).toThrow();
  });

  it('rejects a malformed todo in the array', () => {
    expect(() =>
      SyncPushBodySchema.parse({
        clientId,
        todos: [{ ...makeTodo(), text: '' }],
      }),
    ).toThrow();
  });

  it('rejects missing todos field', () => {
    expect(() =>
      SyncPushBodySchema.parse({ clientId } as unknown as { clientId: string; todos: unknown[] }),
    ).toThrow();
  });
});

describe('ErrorReportSchema', () => {
  const clientId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

  it('accepts the minimum payload (message + clientId only)', () => {
    const parsed = ErrorReportSchema.parse({ message: 'boom', clientId });
    expect(parsed.message).toBe('boom');
    expect(parsed.clientId).toBe(clientId);
  });

  it('accepts a full payload with optional fields', () => {
    const parsed = ErrorReportSchema.parse({
      message: 'render error',
      clientId,
      stack: 'at X (y.js:1:1)',
      userAgent: 'Mozilla/5.0',
      url: 'https://example.com/',
      caughtAt: 'app',
    });
    expect(parsed.stack).toBe('at X (y.js:1:1)');
    expect(parsed.caughtAt).toBe('app');
  });

  it('passes through unknown extra fields', () => {
    const parsed = ErrorReportSchema.parse({
      message: 'boom',
      clientId,
      severity: 'fatal',
      release: 'v1.2.3',
    }) as unknown as Record<string, unknown>;
    expect(parsed.severity).toBe('fatal');
    expect(parsed.release).toBe('v1.2.3');
  });

  it('rejects an empty message', () => {
    expect(() => ErrorReportSchema.parse({ message: '', clientId })).toThrow();
  });

  it('rejects a missing message', () => {
    expect(() => ErrorReportSchema.parse({ clientId })).toThrow();
  });

  it('rejects a missing clientId', () => {
    expect(() => ErrorReportSchema.parse({ message: 'boom' })).toThrow();
  });

  it('rejects a non-ULID clientId', () => {
    expect(() =>
      ErrorReportSchema.parse({ message: 'boom', clientId: 'not-a-ulid' }),
    ).toThrow();
  });

  it('rejects a message over 5000 chars', () => {
    expect(() =>
      ErrorReportSchema.parse({ message: 'a'.repeat(5_001), clientId }),
    ).toThrow();
  });
});
