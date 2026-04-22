import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDb,
  putTodo,
  updateTodo,
  softDeleteTodo,
  resetDbForTests,
} from '../db';
import { getClientId, resetClientIdForTests } from '../clientId';
import { BmadDatabase } from '../db';

describe('db helpers', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    resetClientIdForTests();
    await resetDbForTests();
  });

  afterEach(async () => {
    await resetDbForTests();
    resetClientIdForTests();
    vi.restoreAllMocks();
  });

  it('putTodo({ text }) round-trips via get (P0)', async () => {
    const created = await putTodo({ text: 'hello' });
    const fetched = await getDb().todos.get(created.id);
    expect(fetched).toEqual(created);
  });

  it('putTodo generates a well-formed record (P0)', async () => {
    const todo = await putTodo({ text: 'read book' });
    expect(todo.id).toHaveLength(26);
    expect(todo.clientId).toBe(getClientId());
    expect(todo.createdAt).toBe(todo.updatedAt);
    expect(todo.completed).toBe(false);
    expect(todo.deletedAt).toBeNull();
    expect(todo.text).toBe('read book');
  });

  it('putTodo trims text via TodoSchema', async () => {
    const todo = await putTodo({ text: '  write test  ' });
    expect(todo.text).toBe('write test');
  });

  it('updateTodo bumps updatedAt and leaves createdAt unchanged (P0)', async () => {
    const created = await putTodo({ text: 'ship it' });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updateTodo(created.id, { completed: true });
    expect(updated.completed).toBe(true);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    const fetched = await getDb().todos.get(created.id);
    expect(fetched?.updatedAt).toBe(updated.updatedAt);
  });

  it('updateTodo throws on missing id', async () => {
    await expect(updateTodo('01ARZ3NDEKTSV4RRFFQ69G5FAV', { text: 'x' })).rejects.toThrow();
  });

  it('softDeleteTodo sets deletedAt and bumps updatedAt (P0)', async () => {
    const created = await putTodo({ text: 'delete me' });
    await new Promise((r) => setTimeout(r, 2));
    await softDeleteTodo(created.id);
    const fetched = await getDb().todos.get(created.id);
    expect(fetched?.deletedAt).toBeTypeOf('number');
    expect(fetched?.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  it('resetDbForTests removes all records (P0)', async () => {
    await putTodo({ text: 'a' });
    await putTodo({ text: 'b' });
    expect(await getDb().todos.count()).toBe(2);
    await resetDbForTests();
    expect(await getDb().todos.count()).toBe(0);
  });

  it('putTodo with empty text throws from TodoSchema BEFORE hitting IndexedDB', async () => {
    const putSpy = vi.spyOn(BmadDatabase.prototype, 'transaction');
    await expect(putTodo({ text: '' })).rejects.toThrow();
    await expect(putTodo({ text: '   ' })).rejects.toThrow();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('schema v1 round-trip: close and reopen preserves records', async () => {
    const created = await putTodo({ text: 'persist me' });
    getDb().close();
    // Open a fresh connection to the same IndexedDB database without deleting data
    const reopened = new BmadDatabase();
    const fetched = await reopened.todos.get(created.id);
    expect(fetched).toEqual(created);
    reopened.close();
  });

  it('updateTodo validates patched text via TodoSchema (rejects empty)', async () => {
    const created = await putTodo({ text: 'valid' });
    await expect(updateTodo(created.id, { text: '' })).rejects.toThrow();
  });

  describe('bmad:mutation event', () => {
    it('putTodo dispatches bmad:mutation once on success', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      await putTodo({ text: 'notify me' });
      const mutationEvents = dispatchSpy.mock.calls
        .map((c) => c[0])
        .filter((e): e is CustomEvent => e.type === 'bmad:mutation');
      expect(mutationEvents).toHaveLength(1);
    });

    it('updateTodo dispatches bmad:mutation on success', async () => {
      const created = await putTodo({ text: 'start' });
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      await updateTodo(created.id, { completed: true });
      const mutationEvents = dispatchSpy.mock.calls
        .map((c) => c[0])
        .filter((e): e is CustomEvent => e.type === 'bmad:mutation');
      expect(mutationEvents).toHaveLength(1);
    });

    it('softDeleteTodo dispatches bmad:mutation on first delete only (idempotent)', async () => {
      const created = await putTodo({ text: 'fleeting' });
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      await softDeleteTodo(created.id);
      await softDeleteTodo(created.id); // second call is a no-op
      const mutationEvents = dispatchSpy.mock.calls
        .map((c) => c[0])
        .filter((e): e is CustomEvent => e.type === 'bmad:mutation');
      expect(mutationEvents).toHaveLength(1);
    });

    it('failed mutations do NOT dispatch bmad:mutation', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      await expect(putTodo({ text: '' })).rejects.toThrow();
      const mutationEvents = dispatchSpy.mock.calls
        .map((c) => c[0])
        .filter((e): e is CustomEvent => e.type === 'bmad:mutation');
      expect(mutationEvents).toHaveLength(0);
    });
  });
});
