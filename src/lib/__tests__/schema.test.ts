import { describe, it, expect } from 'vitest';
import { TodoSchema, NewTodoInputSchema } from '../schema';

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
