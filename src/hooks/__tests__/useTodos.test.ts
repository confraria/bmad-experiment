import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

import { useTodos } from '../useTodos';
import { putTodo, resetDbForTests } from '@/lib/db';
import { resetClientIdForTests } from '@/lib/clientId';

describe('useTodos', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    resetClientIdForTests();
    await resetDbForTests();
  });

  afterEach(async () => {
    await resetDbForTests();
    resetClientIdForTests();
    cleanup();
  });

  it('returns undefined on first synchronous render, then an array', async () => {
    const { result } = renderHook(() => useTodos());
    expect(result.current).toBeUndefined();

    await waitFor(() => {
      expect(Array.isArray(result.current)).toBe(true);
    });
    expect(result.current).toEqual([]);
  });

  it('returns todos sorted newest-first by ULID', async () => {
    await putTodo({ text: 'one' });
    await new Promise((r) => setTimeout(r, 2));
    await putTodo({ text: 'two' });
    await new Promise((r) => setTimeout(r, 2));
    await putTodo({ text: 'three' });

    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current).toHaveLength(3);
    });
    expect(result.current!.map((t) => t.text)).toEqual(['three', 'two', 'one']);
  });

  it('reacts to a fresh write — new item appears at position 0', async () => {
    await putTodo({ text: 'first' });
    const { result } = renderHook(() => useTodos());

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    await new Promise((r) => setTimeout(r, 2));
    await putTodo({ text: 'second' });

    await waitFor(() => {
      expect(result.current).toHaveLength(2);
      expect(result.current![0].text).toBe('second');
    });
  });
});
